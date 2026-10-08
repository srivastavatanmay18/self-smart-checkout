import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession } from '../models/ShoppingSession.js';
import { isValidPublicId } from '../utils/publicIds.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

export async function startShoppingSession(request: Request, response: Response): Promise<void> {
  const body = request.body as Record<string, unknown> | undefined;
  const shopId = typeof body?.shopId === 'string' ? body.shopId.trim().toUpperCase() : '';
  const token = body?.token;
  if (!isValidPublicId(shopId, 80) || typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    response.status(400).json({ error: 'Verify a shop QR before starting a shopping session.' });
    return;
  }

  const shop = await Shop.findOne({ shopId, permanentQrToken: token, isActive: true }).select('shopId name location');
  if (!shop) {
    response.status(404).json({ error: 'The verified shop could not be found.' });
    return;
  }

  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const sessionWithPendingPayment = await ShoppingSession.findOne({
    customerId: authUser.id,
    status: 'ACTIVE',
    pendingOrderId: { $exists: true, $ne: null },
  });
  if (sessionWithPendingPayment) {
    response.status(409).json({ error: 'Finish or cancel the pending sandbox payment before starting another shopping session.' });
    return;
  }

  const session = await ShoppingSession.create({
    sessionId: randomUUID(),
    customerId: new mongoose.Types.ObjectId(authUser.id),
    shopId: shop.shopId,
    status: 'ACTIVE',
    startedAt: new Date(),
  });
  response.status(201).json({
    session: {
      sessionId: session.sessionId,
      shopId: session.shopId,
      status: session.status,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
    },
    shop: { shopId: shop.shopId, name: shop.name, location: shop.location },
  });
}

export async function getCurrentShoppingSession(request: Request, response: Response): Promise<void> {
  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const session = await ShoppingSession.findOne({ customerId: authUser.id, status: { $in: ['ACTIVE', 'READY_FOR_EXIT', 'COMPLETED'] } })
    .sort({ startedAt: -1 });
  if (!session) {
    response.json({ session: null });
    return;
  }
  const shop = await Shop.findOne({ shopId: session.shopId }).select('shopId name location');
  response.json({
    session: {
      sessionId: session.sessionId,
      shopId: session.shopId,
      status: session.status,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      ...(session.pendingOrderId ? { pendingOrderId: session.pendingOrderId } : {}),
      ...(session.readyForExitAt ? { readyForExitAt: session.readyForExitAt } : {}),
      ...(session.completedOrderId ? { completedOrderId: session.completedOrderId } : {}),
    },
    shop: shop ? { shopId: shop.shopId, name: shop.name, location: shop.location } : null,
  });
}
