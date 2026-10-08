import { Schema, model, models } from 'mongoose';
import { randomBytes } from 'node:crypto';

export type ShopRecord = {
  shopId: string;
  name: string;
  location: string;
  permanentQrToken: string;
  isActive: boolean;
};

export type PublicShop = Pick<ShopRecord, 'shopId' | 'name' | 'location'>;

const shopSchema = new Schema<ShopRecord>(
  {
    shopId: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    location: { type: String, required: true, trim: true, maxlength: 200 },
    permanentQrToken: {
      type: String,
      required: true,
      unique: true,
      select: false,
      default: () => generateShopQrToken(),
    },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export const Shop = models.Shop ?? model<ShopRecord>('Shop', shopSchema);

export function generateShopQrToken(): string {
  return randomBytes(32).toString('base64url');
}

export function toPublicShop(shop: Pick<ShopRecord, 'shopId' | 'name' | 'location'>): PublicShop {
  return { shopId: shop.shopId, name: shop.name, location: shop.location };
}
