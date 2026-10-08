import 'dotenv/config';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { signAccessToken } from '../middleware/auth.js';
import { Order } from '../models/Order.js';
import { ExitPass } from '../models/ExitPass.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession } from '../models/ShoppingSession.js';
import { User } from '../models/User.js';

async function runCheckoutPaymentFlowCheck(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters.');
  }
  process.env.PAYMENT_MODE = 'sandbox';
  process.env.CHECKOUT_TAX_RATE_BPS = '800';
  process.env.CHECKOUT_DISCOUNT_RATE_BPS = '500';

  const suffix = randomUUID().replaceAll('-', '').toUpperCase();
  const shopId = `CHECKOUT_${suffix}`;
  const customerEmail = `checkout-customer-${suffix.toLowerCase()}@example.invalid`;
  const secondEmail = `checkout-second-${suffix.toLowerCase()}@example.invalid`;
  const guardEmail = `checkout-guard-${suffix.toLowerCase()}@example.invalid`;
  const mainSessionId = randomUUID();
  const stockSessionId = randomUUID();
  const productId = `CHECKOUT_PRODUCT_${suffix}`;
  const stockProductId = `CHECKOUT_STOCK_${suffix}`;
  const orderIds: string[] = [];
  let server: ReturnType<typeof app.listen> | undefined;

  try {
    await mongoose.connect(uri);
    const shop = await Shop.create({ shopId, name: 'Checkout Flow Shop', location: 'Test Location' });
    const [customer, secondCustomer, guard] = await User.create([
      { name: 'Checkout Customer', email: customerEmail, passwordHash: 'test', role: 'CUSTOMER' },
      { name: 'Second Checkout Customer', email: secondEmail, passwordHash: 'test', role: 'CUSTOMER' },
      { name: 'Checkout Guard', email: guardEmail, passwordHash: 'test', role: 'GUARD' },
    ]);
    await ShoppingSession.create([
      { sessionId: mainSessionId, customerId: customer._id, shopId, status: 'ACTIVE' },
      { sessionId: stockSessionId, customerId: secondCustomer._id, shopId, status: 'ACTIVE' },
    ]);
    await Product.create([
      { productId, barcode: `900${suffix.slice(0, 10)}`, name: 'Checkout Test Coffee', price: 100, category: 'Beverages', stock: 5, shopId },
      { productId: stockProductId, barcode: `901${suffix.slice(0, 10)}`, name: 'Checkout Test Rice', price: 50, category: 'Pantry', stock: 5, shopId },
    ]);

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string', 'API did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;
    const customerToken = signAccessToken({ id: String(customer._id), role: 'CUSTOMER' });
    const secondToken = signAccessToken({ id: String(secondCustomer._id), role: 'CUSTOMER' });
    const guardToken = signAccessToken({ id: String(guard._id), role: 'GUARD' });

    async function call(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
      const response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const body = response.status === 204 ? null : await response.json();
      return { status: response.status, body };
    }

    for (let count = 0; count < 2; count += 1) {
      assert.equal((await call('/api/sessions/current/cart/items', {
        method: 'POST', token: customerToken, body: { productId },
      })).status, 200);
    }
    for (let count = 0; count < 2; count += 1) {
      assert.equal((await call('/api/sessions/current/cart/items', {
        method: 'POST', token: secondToken, body: { productId: stockProductId },
      })).status, 200);
    }

    const checkout = await call('/api/sessions/current/checkout', { method: 'POST', token: customerToken });
    assert.equal(checkout.status, 201);
    const mainOrderId = checkout.body.order.orderId as string;
    orderIds.push(mainOrderId);
    assert.equal(checkout.body.order.paymentStatus, 'PENDING');
    assert.equal(checkout.body.order.orderStatus, 'PENDING_PAYMENT');
    assert.equal(checkout.body.order.testMode, true);
    assert.equal(checkout.body.order.sessionId, mainSessionId);
    assert.equal(checkout.body.order.shopId, shopId);
    assert.deepEqual(checkout.body.order.items.map((item: { quantity: number; unitPrice: number; subtotal: number }) => [item.quantity, item.unitPrice, item.subtotal]), [[2, 100, 200]]);
    assert.equal(checkout.body.order.items[0].image, productId, 'checkout snapshots the product image key for guard review');
    assert.equal(checkout.body.order.subtotalAmount, 200);
    assert.equal(checkout.body.order.taxRateBps, 800);
    assert.equal(checkout.body.order.taxAmount, 16);
    assert.equal(checkout.body.order.discountRateBps, 500);
    assert.equal(checkout.body.order.discountAmount, 10);
    assert.equal(checkout.body.order.finalAmount, 206);
    const persistedOrder = await Order.findOne({ orderId: mainOrderId });
    assert(persistedOrder, 'checkout creates a persisted order');
    assert.equal(String(persistedOrder.customerId), String(customer._id));
    assert.equal(persistedOrder.shopId, shopId);
    assert.equal(persistedOrder.sessionId, mainSessionId);
    const lockedSession = await ShoppingSession.findOne({ sessionId: mainSessionId });
    assert.equal(lockedSession?.pendingOrderId, mainOrderId);
    assert.equal((await call('/api/sessions/current/cart', { token: customerToken })).status, 409, 'cart is locked until a sandbox result is recorded');
    const pendingSnapshot = await call('/api/sessions/current', { token: customerToken });
    assert.equal(pendingSnapshot.body.session.pendingOrderId, mainOrderId, 'customer can resume the pending checkout from the portal');
    const resumedCheckout = await call('/api/sessions/current/checkout', { method: 'POST', token: customerToken });
    assert.equal(resumedCheckout.status, 200);
    assert.equal(resumedCheckout.body.order.orderId, mainOrderId, 'reopening a pending checkout does not create a duplicate order');
    assert.equal((await call(`/api/orders/${mainOrderId}/payment`, { token: guardToken })).status, 403, 'payment records are customer-only');
    assert.equal((await call(`/api/orders/${mainOrderId}/payment`, { token: secondToken })).status, 404, 'another customer cannot read this order');

    const failed = await call(`/api/orders/${mainOrderId}/payment`, { method: 'POST', token: customerToken, body: { outcome: 'FAILED' } });
    assert.equal(failed.status, 200);
    assert.equal(failed.body.order.paymentStatus, 'FAILED');
    assert.equal(failed.body.order.orderStatus, 'PAYMENT_FAILED');
    assert.equal(failed.body.order.paidAt, undefined);
    let mainSession = await ShoppingSession.findOne({ sessionId: mainSessionId });
    assert.equal(mainSession?.status, 'ACTIVE');
    assert.equal(mainSession?.pendingOrderId, undefined);

    const cancelled = await call(`/api/orders/${mainOrderId}/payment`, { method: 'POST', token: customerToken, body: { outcome: 'CANCELLED' } });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.order.paymentStatus, 'CANCELLED');
    assert.equal(cancelled.body.order.orderStatus, 'PAYMENT_CANCELLED');
    assert.equal(cancelled.body.order.paidAt, undefined);
    mainSession = await ShoppingSession.findOne({ sessionId: mainSessionId });
    assert.equal(mainSession?.status, 'ACTIVE');

    const success = await call(`/api/orders/${mainOrderId}/payment`, { method: 'POST', token: customerToken, body: { outcome: 'SUCCESS' } });
    assert.equal(success.status, 200);
    assert.equal(success.body.order.paymentStatus, 'SUCCESS');
    assert.equal(success.body.order.orderStatus, 'PAID');
    assert(Number.isFinite(Date.parse(success.body.order.paidAt)));
    assert.equal(success.body.sessionStatus, 'READY_FOR_EXIT');
    mainSession = await ShoppingSession.findOne({ sessionId: mainSessionId });
    assert.equal(mainSession?.status, 'READY_FOR_EXIT');
    assert.equal(mainSession?.pendingOrderId, undefined);
    assert(mainSession?.readyForExitAt, 'successful payment timestamps the ready-for-exit session state');
    const readySnapshot = await call('/api/sessions/current', { token: customerToken });
    assert.equal(readySnapshot.body.session.status, 'READY_FOR_EXIT');
    assert.equal((await call(`/api/orders/${mainOrderId}/payment`, { token: customerToken })).body.order.paymentStatus, 'SUCCESS');

    const stockProduct = await Product.findOne({ productId: stockProductId, shopId });
    assert(stockProduct);
    stockProduct.stock = 1;
    await stockProduct.save();
    const insufficientStock = await call('/api/sessions/current/checkout', { method: 'POST', token: secondToken });
    assert.equal(insufficientStock.status, 409, 'checkout revalidates cart quantity against current stock');
    assert.match(insufficientStock.body.error, /only 1 unit/i);
    assert.equal(await Order.countDocuments({ sessionId: stockSessionId }), 0, 'invalid stock does not create an order');
    let stockSession = await ShoppingSession.findOne({ sessionId: stockSessionId });
    assert.equal(stockSession?.status, 'ACTIVE');
    assert.equal(stockSession?.pendingOrderId, undefined);

    stockProduct.stock = 5;
    await stockProduct.save();
    const secondCheckout = await call('/api/sessions/current/checkout', { method: 'POST', token: secondToken });
    assert.equal(secondCheckout.status, 201);
    const stockOrderId = secondCheckout.body.order.orderId as string;
    orderIds.push(stockOrderId);
    stockProduct.stock = 1;
    await stockProduct.save();
    const changedStockPayment = await call(`/api/orders/${stockOrderId}/payment`, {
      method: 'POST', token: secondToken, body: { outcome: 'SUCCESS' },
    });
    assert.equal(changedStockPayment.status, 409, 'payment success is blocked if stock changes after checkout');
    assert.equal(changedStockPayment.body.order.paymentStatus, 'FAILED');
    stockSession = await ShoppingSession.findOne({ sessionId: stockSessionId });
    assert.equal(stockSession?.status, 'ACTIVE');
    assert.equal(stockSession?.pendingOrderId, undefined);
    stockProduct.stock = 5;
    await stockProduct.save();
    const retriedSuccess = await call(`/api/orders/${stockOrderId}/payment`, {
      method: 'POST', token: secondToken, body: { outcome: 'SUCCESS' },
    });
    assert.equal(retriedSuccess.status, 200, 'a stock validation failure can be retried after stock recovers');
    assert.equal(retriedSuccess.body.order.paymentStatus, 'SUCCESS');
    assert.equal(retriedSuccess.body.sessionStatus, 'READY_FOR_EXIT');

    console.log('PASS checkout creates an order tied to its customer, shop, session, cart, and configured totals');
    console.log('PASS pending checkout locks cart changes and order reads are owner/role protected');
    console.log('PASS sandbox failure and cancellation leave the order unpaid and allow retry');
    console.log('PASS only confirmed sandbox success marks an order paid and session READY_FOR_EXIT');
    console.log('PASS checkout and payment completion both revalidate stock');
  } finally {
    await ExitPass.deleteMany({ orderId: { $in: orderIds } });
    await Order.deleteMany({ orderId: { $in: orderIds } });
    await ShoppingSession.deleteMany({ sessionId: { $in: [mainSessionId, stockSessionId] } });
    await Product.deleteMany({ productId: { $in: [productId, stockProductId] } });
    await Shop.deleteOne({ shopId });
    await User.deleteMany({ email: { $in: [customerEmail, secondEmail, guardEmail] } });
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    }
    await mongoose.disconnect();
  }
}

runCheckoutPaymentFlowCheck().catch((error: unknown) => {
  console.error('Checkout and payment flow check failed:', error);
  process.exitCode = 1;
});
