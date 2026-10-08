import { apiRequest } from './api';

export type ProductAvailability = 'AVAILABLE' | 'OUT_OF_STOCK';
export type ProductDetails = {
  productId: string;
  barcode: string;
  name: string;
  price: number;
  category: string;
  stock: number;
  availability: ProductAvailability;
  shopId: string;
  image?: string;
};

export const productsApi = {
  lookupByBarcode(barcode: string, accessToken: string) {
    return apiRequest<{ product: ProductDetails }>(`/api/products/barcode/${encodeURIComponent(barcode)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  },
};
