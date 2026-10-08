import { apiRequest } from './api';

export type ShopSummary = { shopId: string; name: string; location: string };
export type ActiveShoppingSession = {
  sessionId: string;
  shopId: string;
  status: 'ACTIVE' | 'READY_FOR_EXIT' | 'COMPLETED';
  startedAt: string;
  updatedAt: string;
  pendingOrderId?: string;
  readyForExitAt?: string;
  completedOrderId?: string;
};
export type SessionSnapshot = { session: ActiveShoppingSession | null; shop: ShopSummary | null };
export type ShopQrImage = { shop: ShopSummary; qrCode: string };

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const shopsApi = {
  identify(token: string, accessToken: string) {
    return apiRequest<{ shop: ShopSummary }>('/api/shops/identify', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ token }),
    });
  },
  startSession(shopId: string, token: string, accessToken: string) {
    return apiRequest<SessionSnapshot>('/api/sessions', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ shopId, token }),
    });
  },
  currentSession(accessToken: string) {
    return apiRequest<SessionSnapshot>('/api/sessions/current', {
      headers: authHeaders(accessToken),
    });
  },
  permanentQr(shopId: string, accessToken: string) {
    return apiRequest<ShopQrImage>(`/api/shops/${encodeURIComponent(shopId)}/qr`, {
      headers: authHeaders(accessToken),
    });
  },
};
