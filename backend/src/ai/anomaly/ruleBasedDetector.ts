import type {
  AnomalyAssessment,
  AnomalyCartItem,
  AnomalyInventoryItem,
  AnomalyTransaction,
} from './types.js';

export const ANOMALY_ENGINE_VERSION = 'transparent-rules-v1';

const CHECK_REQUIRED_SCORE = 40;
const UNUSUAL_SINGLE_PRODUCT_QUANTITY = 10;
const UNUSUAL_TOTAL_QUANTITY = 25;
const CENT_TOLERANCE = 1;

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function isFiniteAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Transparent transaction-only risk rules for the hackathon prototype.
 * This module deliberately uses no computer vision or trained-model claims.
 */
export function analyzeTransaction(
  transaction: AnomalyTransaction,
  inventory?: readonly AnomalyInventoryItem[],
  cartItems?: readonly AnomalyCartItem[],
): AnomalyAssessment {
  let score = 0;
  const reasons: string[] = [];
  const addRisk = (points: number, reason: string) => {
    score = Math.min(100, score + points);
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (transaction.paymentStatus !== 'SUCCESS' || transaction.orderStatus !== 'PAID') {
    addRisk(100, 'Payment is not confirmed as successful.');
  }

  if (transaction.items.length === 0) {
    addRisk(100, 'The paid transaction contains no items.');
  }

  const inventoryByProduct = new Map((inventory ?? []).map((item) => [item.productId, item]));
  const quantitiesByProduct = new Map<string, number>();
  const productNames = new Map<string, string>();
  const itemLineCounts = new Map<string, number>();
  let totalQuantity = 0;
  let calculatedItemsSubtotal = 0;

  for (const item of transaction.items) {
    const productId = item.productId.trim();
    quantitiesByProduct.set(productId, (quantitiesByProduct.get(productId) ?? 0) + item.quantity);
    productNames.set(productId, item.name);
    itemLineCounts.set(productId, (itemLineCounts.get(productId) ?? 0) + 1);

    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      addRisk(40, `Invalid quantity recorded for ${item.name || 'an item'}.`);
    } else {
      totalQuantity += item.quantity;
    }

    if (!isFiniteAmount(item.unitPrice) || !isFiniteAmount(item.subtotal)) {
      addRisk(40, `Invalid price or subtotal recorded for ${item.name || 'an item'}.`);
    } else {
      calculatedItemsSubtotal += item.subtotal;
      if (Number.isInteger(item.quantity)) {
        const expectedLineCents = toCents(item.unitPrice * item.quantity);
        if (Math.abs(toCents(item.subtotal) - expectedLineCents) > CENT_TOLERANCE) {
          addRisk(45, `Item subtotal does not match price and quantity for ${item.name}.`);
        }
      }
    }
  }

  for (const [productId, quantity] of quantitiesByProduct) {
    const name = productNames.get(productId) ?? 'a product';
    if ((itemLineCounts.get(productId) ?? 0) > 1) {
      addRisk(40, `Duplicate product lines were found for ${name}.`);
    }
    if (quantity > UNUSUAL_SINGLE_PRODUCT_QUANTITY) {
      addRisk(45, `Unusual quantity detected for ${name} (${quantity} units).`);
    }

    if (inventory) {
      const stockRecord = inventoryByProduct.get(productId);
      if (!stockRecord) {
        addRisk(45, `The inventory record for ${name} could not be found.`);
      } else if (quantity > stockRecord.stock) {
        addRisk(45, `Purchased quantity for ${name} exceeds currently recorded stock.`);
      }
    }
  }

  if (totalQuantity > UNUSUAL_TOTAL_QUANTITY) {
    addRisk(30, `Unusually high total quantity detected (${totalQuantity} units).`);
  }

  if (![transaction.subtotalAmount, transaction.taxAmount, transaction.discountAmount, transaction.totalAmount].every(isFiniteAmount)) {
    addRisk(40, 'One or more transaction totals are invalid.');
  } else {
    if (Math.abs(toCents(calculatedItemsSubtotal) - toCents(transaction.subtotalAmount)) > CENT_TOLERANCE) {
      addRisk(45, 'Cart item subtotals do not match the recorded subtotal.');
    }
    const expectedTotalCents = toCents(transaction.subtotalAmount + transaction.taxAmount - transaction.discountAmount);
    if (Math.abs(expectedTotalCents - toCents(transaction.totalAmount)) > CENT_TOLERANCE) {
      addRisk(45, 'The paid amount does not match subtotal, tax, and discount.');
    }
  }

  if (cartItems) {
    const paidByProduct = new Map<string, { quantity: number; unitPriceCents: number }>();
    for (const item of transaction.items) {
      const existing = paidByProduct.get(item.productId) ?? { quantity: 0, unitPriceCents: toCents(item.unitPrice) };
      existing.quantity += item.quantity;
      paidByProduct.set(item.productId, existing);
    }
    const cartByProduct = new Map<string, { quantity: number; unitPriceCents: number }>();
    for (const item of cartItems) {
      const existing = cartByProduct.get(item.productId) ?? { quantity: 0, unitPriceCents: toCents(item.price) };
      existing.quantity += item.quantity;
      cartByProduct.set(item.productId, existing);
    }
    const productIds = new Set([...paidByProduct.keys(), ...cartByProduct.keys()]);
    const cartMismatch = [...productIds].some((productId) => {
      const paid = paidByProduct.get(productId);
      const cart = cartByProduct.get(productId);
      return !paid || !cart || paid.quantity !== cart.quantity || paid.unitPriceCents !== cart.unitPriceCents;
    });
    if (cartMismatch) addRisk(45, 'The paid order does not match the shopping session cart.');
  }

  const anomalyScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    status: anomalyScore >= CHECK_REQUIRED_SCORE ? 'CHECK_REQUIRED' : 'VERIFIED',
    anomalyScore,
    reasons,
  };
}
