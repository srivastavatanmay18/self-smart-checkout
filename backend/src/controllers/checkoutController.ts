import type { Request, Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Order, type OrderItemRecord, type OrderRecord, type PaymentStatus } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { ShoppingSession, type ShoppingCartItemRecord, type ShoppingSessionRecord } from '../models/ShoppingSession.js';
import { ensureExitPassForPaidOrder } from '../services/exitPassTokens.js';
import { ensureAnomalyVerification } from '../services/anomalyVerification.js';
import { reserveOrderStock } from '../services/inventoryReservation.js';
import { calculateCheckoutAmounts } from '../services/checkoutPricing.js';
import { isSandboxPaymentEnabled, simulateSandboxPayment, type SandboxPaymentOutcome } from '../services/sandboxPayment.js';
import { isValidPublicId } from '../utils/publicIds.js';

function publicOrder(order: OrderRecord) {
  return {
    orderId: order.orderId,
    shopId: order.shopId,
    sessionId: order.sessionId,
    items: order.items.map((item) => ({
      productId: item.productId,
      barcode: item.barcode,
      name: item.name,
      category: item.category,
      image: item.image,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    subtotalAmount: order.subtotalAmount,
    taxRateBps: order.taxRateBps,
    taxAmount: order.taxAmount,
    discountRateBps: order.discountRateBps,
    discountAmount: order.discountAmount,
    finalAmount: order.finalAmount,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    testMode: order.testMode,
    failureReason: order.failureReason,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    paidAt: order.paidAt,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

async function getActiveSession(request: Request, response: Response) {
  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser) {
    response.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  const session = await ShoppingSession.findOne({ customerId: authUser.id, status: 'ACTIVE' }).sort({ startedAt: -1 });
  if (!session) {
    response.status(409).json({ error: 'Start a shopping session before opening checkout.' });
    return null;
  }
  return { authUser, session };
}

async function releasePendingOrder(session: HydratedDocument<ShoppingSessionRecord> | null, reason: string): Promise<void> {
  if (!session?.pendingOrderId) return;
  const pendingOrder = await Order.findOne({ orderId: session.pendingOrderId, paymentStatus: 'PENDING' });
  if (pendingOrder) {
    pendingOrder.paymentStatus = 'FAILED';
    pendingOrder.orderStatus = 'PAYMENT_FAILED';
    pendingOrder.failureReason = reason;
    await pendingOrder.save();
  }
  session.pendingOrderId = undefined;
  await session.save();
}

function orderMatchesCart(order: OrderRecord, cartItems: ShoppingCartItemRecord[]): boolean {
  if (order.items.length !== cartItems.length) return false;
  return order.items.every((orderItem) => {
    const cartItem = cartItems.find((item) => item.productId === orderItem.productId);
    return Boolean(cartItem && cartItem.quantity === orderItem.quantity && cartItem.price === orderItem.unitPrice);
  });
}

export async function createCheckout(request: Request, response: Response): Promise<void> {
  const current = await getActiveSession(request, response);
  if (!current) return;
  const { authUser, session } = current;
  if (session.items.length === 0) {
    response.status(400).json({ error: 'Add at least one available product to your cart before checkout.' });
    return;
  }

  const productIds = session.items.map((item: ShoppingCartItemRecord) => item.productId);
  const products = await Product.find({ shopId: session.shopId, productId: { $in: productIds }, isActive: { $ne: false } });
  const productsById = new Map(products.map((product) => [product.productId, product]));
  const orderItems: OrderItemRecord[] = [];
  for (const cartItem of session.items as ShoppingCartItemRecord[]) {
    const product = productsById.get(cartItem.productId);
    if (!product) {
      await releasePendingOrder(session, `${cartItem.name} is no longer available in this shop.`);
      response.status(409).json({ error: `${cartItem.name} is no longer available in this shop. Review your cart and try again.` });
      return;
    }
    if (product.stock < cartItem.quantity) {
      await releasePendingOrder(session, `${cartItem.name} has only ${product.stock} unit(s) in stock.`);
      response.status(409).json({ error: `${cartItem.name}: only ${product.stock} unit(s) remain. Update your cart before checkout.` });
      return;
    }
    cartItem.price = product.price;
    orderItems.push({
      productId: product.productId,
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      image: product.image ?? product.productId,
      unitPrice: product.price,
      quantity: cartItem.quantity,
      subtotal: Math.round((product.price * cartItem.quantity + Number.EPSILON) * 100) / 100,
    });
  }
  await session.save();

  let amounts;
  try {
    amounts = calculateCheckoutAmounts(orderItems);
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : 'Checkout pricing is not configured correctly.' });
    return;
  }

  if (session.pendingOrderId) {
    const pendingOrder = await Order.findOne({ orderId: session.pendingOrderId, paymentStatus: 'PENDING' });
    if (pendingOrder && orderMatchesCart(pendingOrder, session.items)) {
      response.json({ order: publicOrder(pendingOrder) });
      return;
    }
    if (pendingOrder) {
      pendingOrder.paymentStatus = 'FAILED';
      pendingOrder.orderStatus = 'PAYMENT_FAILED';
      pendingOrder.failureReason = 'The cart changed after this checkout was created.';
      await pendingOrder.save();
    }
    session.pendingOrderId = undefined;
    await session.save();
  }

  const existingPending = await Order.findOne({ sessionId: session.sessionId, paymentStatus: 'PENDING' });
  if (existingPending) {
    if (orderMatchesCart(existingPending, session.items)) {
      session.pendingOrderId = existingPending.orderId;
      await session.save();
      response.json({ order: publicOrder(existingPending) });
      return;
    }
    existingPending.paymentStatus = 'FAILED';
    existingPending.orderStatus = 'PAYMENT_FAILED';
    existingPending.failureReason = 'The cart changed after this checkout was created.';
    await existingPending.save();
  }

  const order = new Order({
    orderId: randomUUID(),
    customerId: authUser.id,
    shopId: session.shopId,
    sessionId: session.sessionId,
    items: orderItems,
    ...amounts,
    currency: 'INR',
    paymentStatus: 'PENDING',
    orderStatus: 'PENDING_PAYMENT',
    testMode: true,
  });
  try {
    await order.save();
  } catch (error) {
    if (isDuplicateKey(error)) {
      const pendingOrder = await Order.findOne({ sessionId: session.sessionId, paymentStatus: 'PENDING' });
      if (pendingOrder) {
        session.pendingOrderId = pendingOrder.orderId;
        await session.save();
        response.json({ order: publicOrder(pendingOrder) });
        return;
      }
    }
    throw error;
  }

  session.pendingOrderId = order.orderId;
  try {
    await session.save();
  } catch (error) {
    order.paymentStatus = 'FAILED';
    order.orderStatus = 'PAYMENT_FAILED';
    order.failureReason = 'Checkout could not be attached to the shopping session.';
    await order.save();
    throw error;
  }
  response.status(201).json({ order: publicOrder(order) });
}

async function validateOrderStock(order: OrderRecord, sessionItems: ShoppingCartItemRecord[]): Promise<string | null> {
  if (!orderMatchesCart(order, sessionItems)) return 'Your cart changed after checkout. Review it and try again.';
  const products = await Product.find({
    shopId: order.shopId,
    productId: { $in: order.items.map((item) => item.productId) },
    isActive: { $ne: false },
  });
  const productsById = new Map(products.map((product) => [product.productId, product]));
  for (const item of order.items) {
    const product = productsById.get(item.productId);
    if (!product) return `${item.name} is no longer available in this shop.`;
    if (product.stock < item.quantity) return `${item.name}: only ${product.stock} unit(s) remain.`;
    if (product.price !== item.unitPrice) return `${item.name}'s price changed. Start checkout again to review the new total.`;
  }
  return null;
}

async function failForStock(order: HydratedDocument<OrderRecord> | null, session: HydratedDocument<ShoppingSessionRecord>, reason: string): Promise<void> {
  if (order) {
    order.paymentStatus = 'FAILED';
    order.orderStatus = 'PAYMENT_FAILED';
    order.failureReason = reason;
    await order.save();
  }
  if (session.pendingOrderId === order?.orderId) {
    session.pendingOrderId = undefined;
    await session.save();
  }
}

async function respondWithPaidOrder(order: HydratedDocument<OrderRecord>, customerId: string, response: Response): Promise<void> {
  const paidSession = await ShoppingSession.findOne({ sessionId: order.sessionId, customerId });
  if (!paidSession) {
    response.status(409).json({ error: 'The paid order is not linked to an available shopping session.' });
    return;
  }
  if (paidSession.status === 'ACTIVE') {
    paidSession.status = 'READY_FOR_EXIT';
    paidSession.readyForExitAt = order.paidAt ?? new Date();
    paidSession.completedOrderId = order.orderId;
    await paidSession.save();
  }
  const exitPass = await ensureExitPassForPaidOrder(order, paidSession);
  try {
    await ensureAnomalyVerification(order, paidSession);
  } catch {
    console.error('Anomaly assessment could not be saved for a paid order.');
  }
  response.json({
    order: publicOrder(order),
    sessionStatus: paidSession.status,
    exitPass: { exitPassId: exitPass.exitPassId, status: exitPass.status, expiresAt: exitPass.expiresAt },
  });
}

export async function simulateOrderPayment(request: Request, response: Response): Promise<void> {
  if (!isSandboxPaymentEnabled()) {
    response.status(503).json({ error: 'Only sandbox payments are enabled for this prototype.' });
    return;
  }
  const outcome = request.body?.outcome as unknown;
  if (outcome !== 'SUCCESS' && outcome !== 'FAILED' && outcome !== 'CANCELLED') {
    response.status(400).json({ error: 'Choose a supported sandbox payment outcome.' });
    return;
  }
  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const orderId = typeof request.params.orderId === 'string' ? request.params.orderId.trim() : '';
  if (!isValidPublicId(orderId)) {
    response.status(400).json({ error: 'Order ID is invalid.' });
    return;
  }
  let order = await Order.findOne({ orderId, customerId: authUser.id });
  if (!order) {
    response.status(404).json({ error: 'Order was not found.' });
    return;
  }
  if (!order.testMode) {
    response.status(503).json({ error: 'This prototype payment endpoint only handles sandbox orders.' });
    return;
  }
  if (order.paymentStatus === 'SUCCESS') {
    await respondWithPaidOrder(order, authUser.id, response);
    return;
  }

  const session = await ShoppingSession.findOne({ sessionId: order.sessionId, customerId: authUser.id, status: 'ACTIVE' });
  if (!session) {
    response.status(409).json({ error: 'The shopping session is no longer active.' });
    return;
  }
  if (session.pendingOrderId && session.pendingOrderId !== order.orderId) {
    response.status(409).json({ error: 'Another checkout is already pending for this shopping session.' });
    return;
  }

  const paymentAttemptId = randomUUID();
  const claimedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: { $in: ['PENDING', 'FAILED', 'CANCELLED'] },
      paymentProcessingId: { $exists: false },
    },
    { $set: { paymentProcessingId: paymentAttemptId, paymentProcessingAt: new Date() } },
    { new: true },
  );
  if (!claimedOrder) {
    const latestOrder = await Order.findOne({ orderId, customerId: authUser.id });
    if (latestOrder?.paymentStatus === 'SUCCESS') {
      await respondWithPaidOrder(latestOrder, authUser.id, response);
      return;
    }
    response.status(409).json({ error: 'Another payment attempt is already being processed for this order.' });
    return;
  }
  order = claimedOrder;

  try {
    if (outcome === 'SUCCESS') {
      const stockError = await validateOrderStock(order, session.items as ShoppingCartItemRecord[]);
      if (stockError) {
        await failForStock(order, session, stockError);
        response.status(409).json({ error: stockError, order: publicOrder(order) });
        return;
      }
    }

    session.pendingOrderId = order.orderId;
    await session.save();
    order.paymentStatus = 'PENDING';
    order.orderStatus = 'PENDING_PAYMENT';
    order.failureReason = undefined;
    await order.save();

    const paymentStatus: PaymentStatus = simulateSandboxPayment(outcome as SandboxPaymentOutcome);
    let rollbackStock: (() => Promise<void>) | undefined;
    if (paymentStatus === 'SUCCESS') {
      const reservation = await reserveOrderStock(order);
      if (!reservation.reserved) {
        await failForStock(order, session, reservation.reason);
        response.status(409).json({ error: reservation.reason, order: publicOrder(order) });
        return;
      }
      rollbackStock = reservation.rollback;
      for (const item of order.items) {
        item.stockAtPayment = reservation.stockByProduct.get(item.productId);
      }
      order.stockDeductedAt = new Date();
    }
    order.paymentStatus = paymentStatus;
    order.orderStatus = paymentStatus === 'SUCCESS'
      ? 'PAID'
      : paymentStatus === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_CANCELLED';
    if (paymentStatus === 'SUCCESS') order.paidAt = new Date();
    else order.paidAt = undefined;
    if (paymentStatus === 'FAILED') order.failureReason = 'Sandbox payment was declined.';
    if (paymentStatus === 'CANCELLED') order.failureReason = 'Sandbox payment was cancelled by the customer.';
    try {
      await order.save();
    } catch (error) {
      if (rollbackStock) await rollbackStock();
      throw error;
    }

    if (paymentStatus === 'SUCCESS') {
      session.status = 'READY_FOR_EXIT';
      session.readyForExitAt = new Date();
      session.completedOrderId = order.orderId;
    }
    session.pendingOrderId = undefined;
    await session.save();
    const exitPass = paymentStatus === 'SUCCESS' ? await ensureExitPassForPaidOrder(order, session) : null;
    if (paymentStatus === 'SUCCESS') {
      try {
        await ensureAnomalyVerification(order, session);
      } catch {
        console.error('Anomaly assessment could not be saved for a paid order.');
      }
    }
    response.json({
      order: publicOrder(order),
      sessionStatus: session.status,
      ...(exitPass ? { exitPass: { exitPassId: exitPass.exitPassId, status: exitPass.status, expiresAt: exitPass.expiresAt } } : {}),
    });
  } finally {
    await Order.updateOne(
      { _id: order._id, paymentProcessingId: paymentAttemptId },
      { $unset: { paymentProcessingId: 1, paymentProcessingAt: 1 } },
    );
  }
}

export async function getOrderPaymentStatus(request: Request, response: Response): Promise<void> {
  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const orderId = typeof request.params.orderId === 'string' ? request.params.orderId.trim() : '';
  if (!isValidPublicId(orderId)) {
    response.status(400).json({ error: 'Order ID is invalid.' });
    return;
  }
  const order = await Order.findOne({ orderId, customerId: authUser.id });
  if (!order) {
    response.status(404).json({ error: 'Order was not found.' });
    return;
  }
  const session = await ShoppingSession.findOne({ sessionId: order.sessionId, customerId: authUser.id }).select('status');
  response.json({ order: publicOrder(order), sessionStatus: session?.status ?? null });
}
