export type CheckoutAmounts = {
  subtotalAmount: number;
  taxRateBps: number;
  taxAmount: number;
  discountRateBps: number;
  discountAmount: number;
  finalAmount: number;
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function readBasisPoints(name: string): number {
  const raw = process.env[name];
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${name} must be a whole number between 0 and 10000.`);
  }
  return value;
}

export function calculateCheckoutAmounts(items: Array<{ unitPrice: number; quantity: number }>): CheckoutAmounts {
  const subtotalAmount = money(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const taxRateBps = readBasisPoints('CHECKOUT_TAX_RATE_BPS');
  const discountRateBps = readBasisPoints('CHECKOUT_DISCOUNT_RATE_BPS');
  const taxAmount = money(subtotalAmount * taxRateBps / 10_000);
  const discountAmount = money(subtotalAmount * discountRateBps / 10_000);
  return {
    subtotalAmount,
    taxRateBps,
    taxAmount,
    discountRateBps,
    discountAmount,
    finalAmount: money(Math.max(0, subtotalAmount + taxAmount - discountAmount)),
  };
}
