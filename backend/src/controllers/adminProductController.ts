import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Product } from '../models/Product.js';
import { isValidPublicId } from '../utils/publicIds.js';

const BARCODE_PATTERN = /^\d{8,14}$/;
const PRODUCT_FIELDS = ['name', 'barcode', 'price', 'category', 'stock', 'image', 'isActive'] as const;
type ProductField = (typeof PRODUCT_FIELDS)[number];

function safePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function publicProduct(product: {
  productId: string;
  name: string;
  barcode: string;
  price: number;
  category: string;
  stock: number;
  image?: string;
  shopId: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    productId: product.productId,
    name: product.name,
    barcode: product.barcode,
    price: product.price,
    category: product.category,
    stock: product.stock,
    image: product.image ?? null,
    shopId: product.shopId,
    isActive: product.isActive ?? true,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function bodyRecord(request: Request): Record<string, unknown> {
  return typeof request.body === 'object' && request.body !== null && !Array.isArray(request.body)
    ? request.body as Record<string, unknown>
    : {};
}

function validateFields(body: Record<string, unknown>, partial: boolean): string | null {
  if (!partial || 'name' in body) {
    if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.trim().length > 160) return 'Product name is required and must be 160 characters or fewer.';
  }
  if (!partial || 'barcode' in body) {
    if (typeof body.barcode !== 'string' || !BARCODE_PATTERN.test(body.barcode.trim())) return 'Barcode must contain 8 to 14 digits.';
  }
  if (!partial || 'price' in body) {
    if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0) return 'Price must be a valid non-negative number.';
  }
  if (!partial || 'category' in body) {
    if (typeof body.category !== 'string' || body.category.trim().length < 1 || body.category.trim().length > 80) return 'Category is required and must be 80 characters or fewer.';
  }
  if (!partial || 'stock' in body) {
    if (typeof body.stock !== 'number' || !Number.isInteger(body.stock) || body.stock < 0) return 'Stock must be a whole number greater than or equal to zero.';
  }
  if ('image' in body && body.image !== null && (typeof body.image !== 'string' || body.image.trim().length > 500)) return 'Image must be a URL or asset reference of 500 characters or fewer.';
  if ('isActive' in body && typeof body.isActive !== 'boolean') return 'Active status must be true or false.';
  return null;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function isValidationError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'ValidationError';
}

function shopIdFromRequest(request: Request): string | null {
  return (request as AuthenticatedRequest).authUser?.shopId ?? null;
}

function normalizedProductId(request: Request): string {
  return typeof request.params.productId === 'string' ? request.params.productId.trim().toUpperCase() : '';
}

export async function listAdminProducts(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  if (!shopId) {
    response.status(403).json({ error: 'This salesman account is not assigned to a shop.' });
    return;
  }
  const search = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 80) : '';
  const filter: Record<string, unknown> = { shopId };
  if (search) {
    const pattern = new RegExp(safePattern(search), 'i');
    filter.$or = [{ name: pattern }, { barcode: pattern }, { productId: pattern }, { category: pattern }];
  }
  const products = await Product.find(filter).sort({ name: 1 }).limit(250);
  response.json({ products: products.map(publicProduct) });
}

export async function getAdminProduct(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  const productId = normalizedProductId(request);
  if (!isValidPublicId(productId)) {
    response.status(400).json({ error: 'Product ID is invalid.' });
    return;
  }
  const product = shopId ? await Product.findOne({ productId, shopId }) : null;
  if (!product) {
    response.status(404).json({ error: 'Product was not found in your shop.' });
    return;
  }
  response.json({ product: publicProduct(product) });
}

export async function createAdminProduct(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  if (!shopId) {
    response.status(403).json({ error: 'This salesman account is not assigned to a shop.' });
    return;
  }
  const body = bodyRecord(request);
  const validationError = validateFields(body, false);
  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }
  try {
    const product = await Product.create({
      productId: `ADMIN_${randomUUID()}`,
      name: (body.name as string).trim(),
      barcode: (body.barcode as string).trim(),
      price: body.price,
      category: (body.category as string).trim(),
      stock: body.stock,
      ...(typeof body.image === 'string' && body.image.trim() ? { image: body.image.trim() } : {}),
      shopId,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : true,
    });
    response.status(201).json({ product: publicProduct(product) });
  } catch (error) {
    if (isDuplicateKey(error)) {
      response.status(409).json({ error: 'A product with this barcode already exists in your shop.' });
      return;
    }
    if (isValidationError(error)) {
      response.status(400).json({ error: 'Product data did not pass validation.' });
      return;
    }
    throw error;
  }
}

export async function updateAdminProduct(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  const productId = normalizedProductId(request);
  if (!isValidPublicId(productId)) {
    response.status(400).json({ error: 'Product ID is invalid.' });
    return;
  }
  const product = shopId ? await Product.findOne({ productId, shopId }) : null;
  if (!product) {
    response.status(404).json({ error: 'Product was not found in your shop.' });
    return;
  }

  const body = bodyRecord(request);
  const suppliedFields = PRODUCT_FIELDS.filter((field: ProductField) => field in body);
  if (suppliedFields.length === 0) {
    response.status(400).json({ error: 'Provide at least one product field to update.' });
    return;
  }
  const validationError = validateFields(body, true);
  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  for (const field of suppliedFields) {
    if (field === 'name' || field === 'category' || field === 'barcode') {
      product[field] = (body[field] as string).trim();
    } else if (field === 'image') {
      product.image = typeof body.image === 'string' && body.image.trim() ? body.image.trim() : undefined;
    } else if (field === 'isActive') {
      product.isActive = body.isActive as boolean;
    } else if (field === 'price') {
      product.price = body.price as number;
    } else if (field === 'stock') {
      product.stock = body.stock as number;
    }
  }

  try {
    await product.save();
    response.json({ product: publicProduct(product) });
  } catch (error) {
    if (isDuplicateKey(error)) {
      response.status(409).json({ error: 'A product with this barcode already exists in your shop.' });
      return;
    }
    if (isValidationError(error)) {
      response.status(400).json({ error: 'Product data did not pass validation.' });
      return;
    }
    throw error;
  }
}

export async function deactivateAdminProduct(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  const productId = normalizedProductId(request);
  if (!isValidPublicId(productId)) {
    response.status(400).json({ error: 'Product ID is invalid.' });
    return;
  }
  const product = shopId ? await Product.findOne({ productId, shopId }) : null;
  if (!product) {
    response.status(404).json({ error: 'Product was not found in your shop.' });
    return;
  }
  product.isActive = false;
  await product.save();
  response.json({ product: publicProduct(product) });
}
