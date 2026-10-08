import type { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Product } from '../models/Product.js';
import { ShoppingSession } from '../models/ShoppingSession.js';

const BARCODE_PATTERN = /^\d{8,14}$/;

export async function lookupProductByBarcode(request: Request, response: Response): Promise<void> {
  const barcode = typeof request.params.barcode === 'string' ? request.params.barcode.trim() : '';
  if (!BARCODE_PATTERN.test(barcode)) {
    response.status(400).json({ error: 'Enter or scan a barcode containing 8 to 14 digits.' });
    return;
  }

  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const session = await ShoppingSession.findOne({ customerId: authUser.id, status: 'ACTIVE' })
    .sort({ startedAt: -1 });
  if (!session) {
    response.status(409).json({ error: 'Scan a Shop QR and start a shopping session before looking up products.' });
    return;
  }
  if (session.pendingOrderId) {
    response.status(409).json({ error: 'Checkout is in progress. Finish or cancel the sandbox payment to continue shopping.' });
    return;
  }

  const product = await Product.findOne({ shopId: session.shopId, barcode, isActive: { $ne: false } });
  if (!product) {
    response.status(404).json({ error: 'No product with this barcode is available in your current shop.' });
    return;
  }
  response.json({
    product: {
      productId: product.productId,
      barcode: product.barcode,
      name: product.name,
      price: product.price,
      category: product.category,
      stock: product.stock,
      image: product.image,
      isActive: product.isActive ?? true,
      availability: product.stock > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
      shopId: product.shopId,
    },
  });
}
