import { apiRequest } from './api';

export type CheckoutLine = {
  productId: string;
  barcode: string;
  name: string;
  category: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

export type CheckoutOrder = {
  orderId: string;
  shopId: string;
  sessionId: string;
  items: CheckoutLine[];
  subtotalAmount: number;
  taxRateBps: number;
  taxAmount: number;
  discountRateBps: number;
  discountAmount: number;
  finalAmount: number;
  currency: 'INR';
  paymentStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  orderStatus: 'PENDING_PAYMENT' | 'PAID' | 'PAYMENT_FAILED' | 'PAYMENT_CANCELLED';
  testMode: boolean;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
};

export type CheckoutResult = {
  order: CheckoutOrder;
  sessionStatus?: 'ACTIVE' | 'READY_FOR_EXIT' | 'COMPLETED' | null;
  exitPass?: { exitPassId: string; status: 'ACTIVE' | 'CHECK_REQUIRED' | 'USED' | 'EXPIRED' | 'REVOKED'; expiresAt: string };
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const checkoutApi = {
  create(accessToken: string) {
    return apiRequest<CheckoutResult>('/api/sessions/current/checkout', {
      method: 'POST',
      headers: authHeaders(accessToken),
    });
  },
  paymentStatus(orderId: string, accessToken: string) {
    return apiRequest<CheckoutResult>(`/api/orders/${encodeURIComponent(orderId)}/payment`, {
      headers: authHeaders(accessToken),
    });
  },
  simulatePayment(orderId: string, outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED', accessToken: string) {
    return apiRequest<CheckoutResult>(`/api/orders/${encodeURIComponent(orderId)}/payment`, {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ outcome }),
    });
  },
};
