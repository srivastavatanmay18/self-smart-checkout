import { apiRequest } from './api';

export type AdminProduct = {
  productId: string;
  name: string;
  barcode: string;
  price: number;
  category: string;
  stock: number;
  image: string | null;
  shopId: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminTransaction = {
  orderId: string;
  createdAt?: string;
  paidAt: string | null;
  shopId: string;
  shopName: string;
  items: { productId: string; name: string; barcode: string; image: string; category: string; quantity: number; unitPrice: number; subtotal: number }[];
  numberOfItems: number;
  subtotalAmount: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paymentStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  orderStatus: string;
  exitStatus: string;
  exitVerifiedAt: string | null;
  aiVerificationStatus: 'VERIFIED' | 'CHECK_REQUIRED' | null;
  anomalyScore: number | null;
  reasons: string[];
};

export type AdminDashboard = {
  shop: { shopId: string; name: string; location: string };
  stats: {
    totalProducts: number;
    activeProducts: number;
    totalInventoryUnits: number;
    todayOrders: number;
    todaySales: number;
    completedTransactions: number;
    pendingTransactions: number;
    lowStockProducts: number;
    lowStockThreshold: number;
  };
  lowStockItems: AdminProduct[];
};

export type AdminSalesAnalytics = {
  period: 'today' | '7d';
  from: string;
  to: string;
  summary: {
    totalSales: number;
    numberOfOrders: number;
    paidOrders: number;
    completedOrders: number;
    cancelledOrFailedOrders: number;
    averageOrderValue: number;
  };
  topSellingProducts: { productId: string; name: string; quantitySold: number; salesAmount: number }[];
  recentTransactions: AdminTransaction[];
  shop: { shopId: string; name: string };
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export const adminApi = {
  dashboard(accessToken: string) {
    return apiRequest<AdminDashboard>('/api/admin/dashboard', { headers: authHeaders(accessToken) });
  },
  products(accessToken: string, search = '') {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return apiRequest<{ products: AdminProduct[] }>(`/api/admin/products${query}`, { headers: authHeaders(accessToken) });
  },
  product(productId: string, accessToken: string) {
    return apiRequest<{ product: AdminProduct }>(`/api/admin/products/${encodeURIComponent(productId)}`, { headers: authHeaders(accessToken) });
  },
  createProduct(product: Pick<AdminProduct, 'name' | 'barcode' | 'price' | 'category' | 'stock'> & { image?: string }, accessToken: string) {
    return apiRequest<{ product: AdminProduct }>('/api/admin/products', {
      method: 'POST',
      headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify(product),
    });
  },
  updateProduct(productId: string, changes: Partial<Pick<AdminProduct, 'name' | 'barcode' | 'price' | 'category' | 'stock' | 'image' | 'isActive'>>, accessToken: string) {
    return apiRequest<{ product: AdminProduct }>(`/api/admin/products/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      headers: { ...authHeaders(accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
  },
  deactivateProduct(productId: string, accessToken: string) {
    return apiRequest<{ product: AdminProduct }>(`/api/admin/products/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      headers: authHeaders(accessToken),
    });
  },
  sales(period: 'today' | '7d', accessToken: string) {
    return apiRequest<AdminSalesAnalytics>(`/api/admin/sales?period=${period}`, { headers: authHeaders(accessToken) });
  },
  transactions(accessToken: string, search = '') {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return apiRequest<{ transactions: AdminTransaction[]; total: number; limit: number; shop: { shopId: string; name: string } }>(`/api/admin/transactions${query}`, { headers: authHeaders(accessToken) });
  },
  flaggedTransactions(accessToken: string) {
    return apiRequest<{ transactions: AdminTransaction[]; total: number; limit: number; shop: { shopId: string; name: string } }>('/api/admin/transactions/flagged', { headers: authHeaders(accessToken) });
  },
  transaction(orderId: string, accessToken: string) {
    return apiRequest<{ transaction: AdminTransaction; shop: { shopId: string; name: string; location: string } }>(`/api/admin/transactions/${encodeURIComponent(orderId)}`, { headers: authHeaders(accessToken) });
  },
};
