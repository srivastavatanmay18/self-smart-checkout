import { apiRequest } from './api';
import type { ShopSummary } from './shops';

export type CartLine = {
  productId: string;
  barcode: string;
  name: string;
  category: string;
  price: number;
  quantity: number;
  subtotal: number;
};

export type CartSnapshot = {
  sessionId: string;
  shopId: string;
  shop: ShopSummary | null;
  items: CartLine[];
  itemCount: number;
  totalAmount: number;
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const cartApi = {
  current(accessToken: string) {
    return apiRequest<{ cart: CartSnapshot }>('/api/sessions/current/cart', {
      headers: authHeaders(accessToken),
    });
  },
  addItem(productId: string, accessToken: string) {
    return apiRequest<{ cart: CartSnapshot }>('/api/sessions/current/cart/items', {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ productId }),
    });
  },
  setQuantity(productId: string, quantity: number, accessToken: string) {
    return apiRequest<{ cart: CartSnapshot }>(`/api/sessions/current/cart/items/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ quantity }),
    });
  },
  removeItem(productId: string, accessToken: string) {
    return apiRequest<{ cart: CartSnapshot }>(`/api/sessions/current/cart/items/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    });
  },
};
