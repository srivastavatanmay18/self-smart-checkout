export type AnomalyStatus = 'VERIFIED' | 'CHECK_REQUIRED';

export type AnomalyItem = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

export type AnomalyCartItem = {
  productId: string;
  price: number;
  quantity: number;
};

export type AnomalyTransaction = {
  orderId: string;
  items: readonly AnomalyItem[];
  subtotalAmount: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentStatus: string;
  orderStatus: string;
};

export type AnomalyInventoryItem = {
  productId: string;
  stock: number;
};

export type AnomalyAssessment = {
  status: AnomalyStatus;
  anomalyScore: number;
  reasons: string[];
};
