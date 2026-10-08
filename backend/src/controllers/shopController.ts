import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { Shop, toPublicShop } from '../models/Shop.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { createShopQrPayload } from '../utils/shopQr.js';
import { isValidPublicId } from '../utils/publicIds.js';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;

export async function identifyShop(request: Request, response: Response): Promise<void> {
  const token = (request.body as Record<string, unknown> | undefined)?.token;
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    response.status(400).json({ error: 'Scan a valid permanent Shop QR code.' });
    return;
  }

  const shop = await Shop.findOne({ permanentQrToken: token, isActive: true }).select('shopId name location');
  if (!shop) {
    response.status(404).json({ error: 'This Shop QR is invalid or the shop is unavailable.' });
    return;
  }
  response.json({ shop: toPublicShop(shop) });
}

export async function getPermanentShopQr(request: Request, response: Response): Promise<void> {
  const shopId = typeof request.params.shopId === 'string' ? request.params.shopId.trim().toUpperCase() : '';
  if (!isValidPublicId(shopId, 80)) {
    response.status(400).json({ error: 'Shop ID is invalid.' });
    return;
  }
  const shop = await Shop.findOne({ shopId, isActive: true }).select('+permanentQrToken shopId name location');
  if (!shop) {
    response.status(404).json({ error: 'Shop was not found or is unavailable.' });
    return;
  }

  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser?.shopId || authUser.shopId !== shop.shopId) {
    response.status(403).json({ error: 'You do not have access to this shop.' });
    return;
  }

  const qrCode = await QRCode.toDataURL(createShopQrPayload(shop.permanentQrToken), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 480,
  });
  response.json({ shop: toPublicShop(shop), qrCode });
}
