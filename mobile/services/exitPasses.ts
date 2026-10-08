import { apiRequest } from './api';

export type ExitPassStatus = 'ACTIVE' | 'CHECK_REQUIRED' | 'USED' | 'EXPIRED' | 'REVOKED';

export type CustomerExitPass = {
  exitPass: {
    exitPassId: string;
    status: ExitPassStatus;
    createdAt: string;
    expiresAt: string;
    verifiedAt?: string;
    checkRequiredAt?: string;
    checkRequiredByGuardId?: string;
    checkRequiredReason?: string;
    qrCode: string | null;
  };
  order: { orderId: string; totalAmount: number; paymentStatus: 'SUCCESS'; paidAt?: string };
  shop: { shopId: string; name: string; location: string };
};

export type GuardExitReview = {
  exitPass: {
    exitPassId: string;
    status: ExitPassStatus;
    canApprove: boolean;
    blockedReason: string | null;
    createdAt?: string;
    expiresAt: string;
    verifiedAt?: string;
    checkRequiredAt?: string;
    checkRequiredByGuardId?: string;
    checkRequiredReason?: string;
  };
  transaction: {
    customerReference: string;
    orderId: string;
    shop: { shopId: string; name: string; location: string };
    items: { productId: string; image?: string; name: string; category: string; unitPrice: number; quantity: number; subtotal: number }[];
    subtotalAmount: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    totalItemCount: number;
    paymentStatus: string;
    orderStatus: string;
    purchasedAt?: string;
    sessionStatus: string | null;
  };
  aiVerification: {
    status: 'VERIFIED' | 'CHECK_REQUIRED';
    anomalyScore: number;
    reasons: string[];
    engineVersion: string;
    createdAt?: string;
  } | null;
  approved?: boolean;
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const exitPassApi = {
  customerPass(orderId: string, accessToken: string) {
    return apiRequest<CustomerExitPass>(`/api/customer/exit-passes/orders/${encodeURIComponent(orderId)}`, {
      headers: authHeaders(accessToken),
    });
  },
  verifyForGuard(token: string, accessToken: string) {
    return apiRequest<GuardExitReview>('/api/guard/exit-passes/verify', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ token }),
    });
  },
  approveForGuard(token: string, accessToken: string) {
    return apiRequest<GuardExitReview>('/api/guard/exit-passes/approve', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ token }),
    });
  },
  markCheckRequired(token: string, reason: string, accessToken: string) {
    return apiRequest<GuardExitReview & { checkRequired: true }>('/api/guard/exit-passes/check-required', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ token, reason }),
    });
  },
};
