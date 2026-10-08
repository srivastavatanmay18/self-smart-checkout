import type { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession, type ShoppingCartItemRecord, type ShoppingSessionRecord } from '../models/ShoppingSession.js';
import { isValidPublicId } from '../utils/publicIds.js';

type CartSession = Pick<ShoppingSessionRecord, 'sessionId' | 'shopId' | 'items'>;

function currency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function cartResponse(session: CartSession) {
  const items = (session.items ?? []).map((item) => ({
    productId: item.productId,
    barcode: item.barcode,
    name: item.name,
    category: item.category,
    price: item.price,
    quantity: item.quantity,
    subtotal: currency(item.price * item.quantity),
  }));
  const totalAmount = currency(items.reduce((sum, item) => sum + item.subtotal, 0));
  const shop = await Shop.findOne({ shopId: session.shopId }).select('shopId name location');
  return {
    sessionId: session.sessionId,
    shopId: session.shopId,
    shop: shop ? { shopId: shop.shopId, name: shop.name, location: shop.location } : null,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount,
  };
}

async function findCurrentSession(request: Request, response: Response) {
  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser) {
    response.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  const session = await ShoppingSession.findOne({ customerId: authUser.id, status: 'ACTIVE' })
    .sort({ startedAt: -1 });
  if (!session) {
    response.status(409).json({ error: 'Start a shopping session by scanning a Shop QR before using your cart.' });
    return null;
  }
  if (session.pendingOrderId) {
    response.status(409).json({ error: 'Checkout is in progress. Finish or cancel the sandbox payment before changing the cart.' });
    return null;
  }
  return session;
}

export async function getCurrentCart(request: Request, response: Response): Promise<void> {
  const session = await findCurrentSession(request, response);
  if (!session) return;
  response.json({ cart: await cartResponse(session) });
}

export async function addCartItem(request: Request, response: Response): Promise<void> {
  const session = await findCurrentSession(request, response);
  if (!session) return;
  const productId = typeof request.body?.productId === 'string' ? request.body.productId.trim().toUpperCase() : '';
  if (!isValidPublicId(productId)) {
    response.status(400).json({ error: 'Provide a valid product ID.' });
    return;
  }

  const product = await Product.findOne({ productId, shopId: session.shopId, isActive: { $ne: false } });
  if (!product) {
    response.status(404).json({ error: 'This product is not available in your current shop.' });
    return;
  }
  if (product.stock < 1) {
    response.status(409).json({ error: 'This product is currently out of stock.' });
    return;
  }

  const existingItem = session.items.find((item: ShoppingCartItemRecord) => item.productId === product.productId);
  if (existingItem) {
    if (existingItem.quantity >= product.stock) {
      response.status(409).json({ error: `Only ${product.stock} unit${product.stock === 1 ? '' : 's'} available.` });
      return;
    }
    existingItem.quantity += 1;
  } else {
    session.items.push({
      productId: product.productId,
      barcode: product.barcode,
      name: product.name,
      price: product.price,
      category: product.category,
      quantity: 1,
    });
  }
  await session.save();
  response.json({ cart: await cartResponse(session) });
}

export async function setCartItemQuantity(request: Request, response: Response): Promise<void> {
  const session = await findCurrentSession(request, response);
  if (!session) return;
  const productId = typeof request.params.productId === 'string' ? request.params.productId.trim().toUpperCase() : '';
  const quantity = request.body?.quantity;
  if (!isValidPublicId(productId)) {
    response.status(400).json({ error: 'Product ID is invalid.' });
    return;
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) {
    response.status(400).json({ error: 'Quantity must be a whole number greater than zero.' });
    return;
  }
  const item = session.items.find((entry: ShoppingCartItemRecord) => entry.productId === productId);
  if (!item) {
    response.status(404).json({ error: 'This product is not in your current cart.' });
    return;
  }
  const product = await Product.findOne({ productId, shopId: session.shopId, isActive: { $ne: false } });
  if (!product) {
    response.status(404).json({ error: 'This product is not available in your current shop.' });
    return;
  }
  if (product.stock < 1 || quantity > product.stock) {
    response.status(409).json({ error: `Only ${product.stock} unit${product.stock === 1 ? '' : 's'} available.` });
    return;
  }
  item.quantity = quantity;
  await session.save();
  response.json({ cart: await cartResponse(session) });
}

export async function removeCartItem(request: Request, response: Response): Promise<void> {
  const session = await findCurrentSession(request, response);
  if (!session) return;
  const productId = typeof request.params.productId === 'string' ? request.params.productId.trim().toUpperCase() : '';
  if (!isValidPublicId(productId)) {
    response.status(400).json({ error: 'Product ID is invalid.' });
    return;
  }
  const itemIndex = session.items.findIndex((entry: ShoppingCartItemRecord) => entry.productId === productId);
  if (itemIndex < 0) {
    response.status(404).json({ error: 'This product is not in your current cart.' });
    return;
  }
  session.items.splice(itemIndex, 1);
  await session.save();
  response.json({ cart: await cartResponse(session) });
}
