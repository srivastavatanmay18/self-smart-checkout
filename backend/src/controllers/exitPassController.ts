import type { Request, Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import QRCode from 'qrcode';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ExitPass, type ExitPassRecord } from '../models/ExitPass.js';
import { Order, type OrderRecord } from '../models/Order.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession, type ShoppingSessionRecord } from '../models/ShoppingSession.js';
import { decryptExitToken, hashExitToken, isValidExitToken } from '../services/exitPassTokens.js';
import { ensureAnomalyVerification } from '../services/anomalyVerification.js';
import { createExitQrPayload } from '../utils/exitQr.js';
import { isValidPublicId } from '../utils/publicIds.js';

type PassDocument = HydratedDocument<ExitPassRecord>;
type OrderDocument = HydratedDocument<OrderRecord>;
type SessionDocument = HydratedDocument<ShoppingSessionRecord>;

function shortCustomerReference(customerId: unknown): string {
  return `CUST-${String(customerId).slice(-8).toUpperCase()}`;
}

async function publicVerification(pass: PassDocument, order: OrderDocument, session: SessionDocument | null) {
  const shop = await Shop.findOne({ shopId: pass.shopId }).select('shopId name location');
  let aiVerification = null;
  try {
    aiVerification = await ensureAnomalyVerification(order, session);
  } catch {
    console.error('Anomaly assessment was unavailable during guard review.');
  }
  const now = new Date();
  if ((pass.status === 'ACTIVE' || pass.status === 'CHECK_REQUIRED') && pass.expiresAt <= now) {
    pass.status = 'EXPIRED';
    await pass.save();
  }

  let blockedReason: string | null = null;
  if (pass.status === 'USED') blockedReason = 'This exit pass has already been used.';
  else if (pass.status === 'EXPIRED') blockedReason = 'This exit pass has expired.';
  else if (pass.status === 'REVOKED') blockedReason = 'This exit pass has been revoked.';
  else if (order.paymentStatus !== 'SUCCESS' || order.orderStatus !== 'PAID') blockedReason = 'The linked order is not successfully paid.';
  else if (!session || session.status !== 'READY_FOR_EXIT') blockedReason = 'The shopping session is not ready for exit.';
  else if (session.completedOrderId && session.completedOrderId !== order.orderId) blockedReason = 'The shopping session belongs to a different completed order.';
  else if (!shop) blockedReason = 'The shop for this transaction could not be found.';

  return {
    exitPass: {
      exitPassId: pass.exitPassId,
      status: pass.status,
      canApprove: blockedReason === null,
      blockedReason,
      createdAt: pass.createdAt,
      expiresAt: pass.expiresAt,
      verifiedAt: pass.verifiedAt,
      ...(pass.status === 'CHECK_REQUIRED' ? {
        checkRequiredAt: pass.checkRequiredAt,
        checkRequiredByGuardId: pass.checkRequiredByGuardId,
        checkRequiredReason: pass.checkRequiredReason,
      } : {}),
    },
    transaction: {
      customerReference: shortCustomerReference(pass.customerId),
      orderId: order.orderId,
      shop: shop ? { shopId: shop.shopId, name: shop.name, location: shop.location } : { shopId: pass.shopId, name: 'Unknown shop', location: '' },
      items: order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        category: item.category,
        image: item.image ?? item.productId,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
      subtotalAmount: order.subtotalAmount,
      taxAmount: order.taxAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.finalAmount,
      totalItemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      purchasedAt: order.paidAt ?? order.createdAt,
      sessionStatus: session?.status ?? null,
    },
    aiVerification: aiVerification ? {
      status: aiVerification.status,
      anomalyScore: aiVerification.anomalyScore,
      reasons: aiVerification.reasons,
      engineVersion: aiVerification.engineVersion,
      createdAt: aiVerification.createdAt,
    } : null,
  };
}

async function loadPassForGuard(request: Request, response: Response) {
  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser?.shopId) {
    response.status(403).json({ error: 'This guard account is not assigned to a shop.' });
    return null;
  }
  const token = (request.body as Record<string, unknown> | undefined)?.token;
  if (!isValidExitToken(token)) {
    response.status(400).json({ error: 'Scan a valid Exit QR code.' });
    return null;
  }
  const pass = await ExitPass.findOne({ tokenHash: hashExitToken(token) }).select('+tokenHash');
  if (!pass) {
    response.status(404).json({ error: 'This Exit QR is invalid or no longer available.' });
    return null;
  }
  if (pass.shopId !== authUser.shopId) {
    response.status(403).json({ error: 'This transaction belongs to another shop.' });
    return null;
  }
  const order = await Order.findOne({ orderId: pass.orderId, customerId: pass.customerId, shopId: pass.shopId });
  if (!order) {
    response.status(404).json({ error: 'The transaction linked to this Exit QR could not be found.' });
    return null;
  }
  const shoppingSession = await ShoppingSession.findOne({
    sessionId: pass.sessionId,
    customerId: pass.customerId,
    shopId: pass.shopId,
  });
  return { authUser, pass, order, shoppingSession };
}

export async function getCustomerExitPass(request: Request, response: Response): Promise<void> {
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
  if (order.paymentStatus !== 'SUCCESS' || order.orderStatus !== 'PAID') {
    response.status(409).json({ error: 'An Exit Pass is available only after payment succeeds.' });
    return;
  }
  const session = await ShoppingSession.findOne({ sessionId: order.sessionId, customerId: authUser.id });
  if (!session || !['READY_FOR_EXIT', 'COMPLETED'].includes(session.status)) {
    response.status(409).json({ error: 'The shopping session is not ready for exit.' });
    return;
  }
  const pass = await ExitPass.findOne({ orderId: order.orderId, customerId: authUser.id })
    .select('+tokenCiphertext +tokenIv +tokenAuthTag');
  if (!pass) {
    response.status(404).json({ error: 'Exit Pass was not found for this paid order.' });
    return;
  }
  if ((pass.status === 'ACTIVE' || pass.status === 'CHECK_REQUIRED') && pass.expiresAt <= new Date()) {
    pass.status = 'EXPIRED';
    await pass.save();
  }
  const shop = await Shop.findOne({ shopId: order.shopId }).select('shopId name location');
  const qrCode = pass.status === 'ACTIVE' || pass.status === 'CHECK_REQUIRED'
    ? await QRCode.toDataURL(createExitQrPayload(decryptExitToken(pass)), { errorCorrectionLevel: 'Q', margin: 2, width: 480 })
    : null;
  response.json({
    exitPass: {
      exitPassId: pass.exitPassId,
      status: pass.status,
      createdAt: pass.createdAt,
      expiresAt: pass.expiresAt,
      verifiedAt: pass.verifiedAt,
      qrCode,
    },
    order: {
      orderId: order.orderId,
      totalAmount: order.finalAmount,
      paymentStatus: order.paymentStatus,
      paidAt: order.paidAt,
    },
    shop: shop ? { shopId: shop.shopId, name: shop.name, location: shop.location } : { shopId: order.shopId, name: 'Unknown shop', location: '' },
  });
}

export async function verifyExitPass(request: Request, response: Response): Promise<void> {
  const loaded = await loadPassForGuard(request, response);
  if (!loaded) return;
  const result = await publicVerification(loaded.pass, loaded.order, loaded.shoppingSession);
  response.json(result);
}

export async function approveExitPass(request: Request, response: Response): Promise<void> {
  const loaded = await loadPassForGuard(request, response);
  if (!loaded) return;
  const { authUser, pass, order, shoppingSession } = loaded;
  const current = await publicVerification(pass, order, shoppingSession);
  if (!current.exitPass.canApprove || !shoppingSession) {
    response.status(pass.status === 'EXPIRED' ? 410 : 409).json({
      error: current.exitPass.blockedReason ?? 'This Exit Pass cannot be approved.',
      ...current,
    });
    return;
  }

  const now = new Date();
  const usedPass = await ExitPass.findOneAndUpdate(
    { _id: pass._id, status: { $in: ['ACTIVE', 'CHECK_REQUIRED'] }, expiresAt: { $gt: now } },
    { $set: { status: 'USED', verifiedAt: now, verifiedByGuardId: authUser.id } },
    { new: true },
  );
  if (!usedPass) {
    const refreshed = await ExitPass.findById(pass._id);
    const refreshedSummary = refreshed ? await publicVerification(refreshed, order, shoppingSession) : null;
    response.status(refreshed?.status === 'EXPIRED' ? 410 : 409).json({
      error: refreshedSummary?.exitPass.blockedReason ?? 'This Exit Pass was already used or expired.',
      ...(refreshedSummary ?? {}),
    });
    return;
  }

  shoppingSession.status = 'COMPLETED';
  shoppingSession.completedOrderId = order.orderId;
  try {
    await shoppingSession.save();
  } catch (error) {
    await ExitPass.updateOne(
      { _id: usedPass._id, status: 'USED', verifiedByGuardId: authUser.id },
      { $set: { status: pass.status }, $unset: { verifiedAt: 1, verifiedByGuardId: 1 } },
    );
    throw error;
  }

  const result = await publicVerification(usedPass, order, shoppingSession);
  result.exitPass.canApprove = false;
  result.exitPass.blockedReason = 'Exit approved; this pass cannot be reused.';
  response.json({ ...result, approved: true });
}

export async function markExitPassCheckRequired(request: Request, response: Response): Promise<void> {
  const loaded = await loadPassForGuard(request, response);
  if (!loaded) return;
  const { authUser, pass, order, shoppingSession } = loaded;
  const current = await publicVerification(pass, order, shoppingSession);
  if (!current.exitPass.canApprove) {
    response.status(pass.status === 'EXPIRED' ? 410 : 409).json({
      error: current.exitPass.blockedReason ?? 'This Exit Pass cannot be marked for inspection.',
      ...current,
    });
    return;
  }
  const body = request.body as Record<string, unknown> | undefined;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    response.status(400).json({ error: 'Provide an inspection reason between 3 and 500 characters.' });
    return;
  }

  const now = new Date();
  const checkPass = await ExitPass.findOneAndUpdate(
    { _id: pass._id, status: { $in: ['ACTIVE', 'CHECK_REQUIRED'] }, expiresAt: { $gt: now } },
    {
      $set: {
        status: 'CHECK_REQUIRED',
        checkRequiredAt: now,
        checkRequiredByGuardId: authUser.id,
        checkRequiredReason: reason,
      },
    },
    { new: true },
  );
  if (!checkPass) {
    const refreshed = await ExitPass.findById(pass._id);
    response.status(refreshed?.status === 'EXPIRED' ? 410 : 409).json({ error: 'This Exit Pass was already used or expired.' });
    return;
  }

  const result = await publicVerification(checkPass, order, shoppingSession);
  result.exitPass.canApprove = false;
  result.exitPass.blockedReason = 'Check required. Compare the items in person, then rescan the pass to continue inspection.';
  response.json({ ...result, checkRequired: true });
}
