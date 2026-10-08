import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import { getJwtSecret } from '../middleware/auth.js';
import { ExitPass, type ExitPassRecord } from '../models/ExitPass.js';
import type { OrderRecord } from '../models/Order.js';
import type { ShoppingSessionRecord } from '../models/ShoppingSession.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function encryptionKey(): Buffer {
  return createHash('sha256').update(`self-smart-checkout:exit-pass:v1:${getJwtSecret()}`).digest();
}

export function hashExitToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isValidExitToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

export function encryptExitToken(token: string): { tokenCiphertext: string; tokenIv: string; tokenAuthTag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    tokenCiphertext: ciphertext.toString('base64url'),
    tokenIv: iv.toString('base64url'),
    tokenAuthTag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptExitToken(pass: Pick<ExitPassRecord, 'tokenCiphertext' | 'tokenIv' | 'tokenAuthTag'>): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(pass.tokenIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(pass.tokenAuthTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(pass.tokenCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function getExitPassTtlMinutes(): number {
  const raw = process.env.EXIT_PASS_TTL_MINUTES;
  const value = raw ? Number(raw) : 15;
  if (!Number.isInteger(value) || value < 1 || value > 1440) {
    throw new Error('EXIT_PASS_TTL_MINUTES must be a whole number between 1 and 1440.');
  }
  return value;
}

export async function ensureExitPassForPaidOrder(
  order: OrderRecord,
  session: HydratedDocument<ShoppingSessionRecord>,
) {
  if (order.paymentStatus !== 'SUCCESS' || order.orderStatus !== 'PAID') {
    throw new Error('An exit pass can only be created for a successfully paid order.');
  }
  if (session.sessionId !== order.sessionId || session.customerId.toString() !== order.customerId.toString()
    || session.shopId !== order.shopId || !['READY_FOR_EXIT', 'COMPLETED'].includes(session.status)) {
    throw new Error('The paid order is not attached to a session ready for exit.');
  }

  const existing = await ExitPass.findOne({ orderId: order.orderId });
  if (existing) return existing;

  const ttlMinutes = getExitPassTtlMinutes();
  const token = randomBytes(32).toString('base64url');
  const encrypted = encryptExitToken(token);
  try {
    await ExitPass.create({
      exitPassId: randomUUID(),
      customerId: order.customerId,
      shopId: order.shopId,
      sessionId: order.sessionId,
      orderId: order.orderId,
      tokenHash: hashExitToken(token),
      ...encrypted,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    });
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
  }
  const pass = await ExitPass.findOne({ orderId: order.orderId });
  if (!pass) throw new Error('Could not create or retrieve the exit pass.');
  return pass;
}

export type EncryptedExitPass = HydratedDocument<ExitPassRecord>;
