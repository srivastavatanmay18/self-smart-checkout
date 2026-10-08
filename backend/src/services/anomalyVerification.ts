import { randomUUID } from 'node:crypto';
import { analyzeTransaction, ANOMALY_ENGINE_VERSION } from '../ai/anomaly/ruleBasedDetector.js';
import type { AnomalyCartItem } from '../ai/anomaly/types.js';
import { AiVerification } from '../models/AiVerification.js';
import type { OrderRecord } from '../models/Order.js';
import { Product } from '../models/Product.js';
import type { ShoppingSessionRecord } from '../models/ShoppingSession.js';

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

/** Creates one immutable risk assessment for a paid order; safe to retry. */
export async function ensureAnomalyVerification(
  order: OrderRecord,
  session: ShoppingSessionRecord | null,
) {
  if (order.paymentStatus !== 'SUCCESS' || order.orderStatus !== 'PAID') return null;

  const existing = await AiVerification.findOne({ transactionId: order.orderId });
  if (existing) return existing;

  const productIds = [...new Set(order.items.map((item) => item.productId))];
  const products = await Product.find({ shopId: order.shopId, productId: { $in: productIds } })
    .select('productId stock');
  const purchaseTimeStock = new Map<string, number>();
  for (const item of order.items) {
    if (typeof item.stockAtPayment === 'number' && !purchaseTimeStock.has(item.productId)) {
      purchaseTimeStock.set(item.productId, item.stockAtPayment);
    }
  }
  const inventory = products.map(({ productId, stock }) => ({
    productId,
    stock: purchaseTimeStock.get(productId) ?? stock,
  }));
  const cartItems: AnomalyCartItem[] | undefined = session
    ? session.items.map((item) => ({ productId: item.productId, price: item.price, quantity: item.quantity }))
    : undefined;
  const assessment = analyzeTransaction(
    {
      orderId: order.orderId,
      items: order.items,
      subtotalAmount: order.subtotalAmount,
      taxAmount: order.taxAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.finalAmount,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
    },
    inventory,
    cartItems,
  );

  try {
    return await AiVerification.create({
      verificationId: randomUUID(),
      transactionId: order.orderId,
      ...assessment,
      engineVersion: ANOMALY_ENGINE_VERSION,
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const concurrentlyCreated = await AiVerification.findOne({ transactionId: order.orderId });
      if (concurrentlyCreated) return concurrentlyCreated;
    }
    throw error;
  }
}
