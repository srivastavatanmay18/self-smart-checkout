import { Schema, model, models } from 'mongoose';

export type ProductRecord = {
  productId: string;
  barcode: string;
  name: string;
  price: number;
  image?: string;
  category: string;
  stock: number;
  shopId: string;
  isActive?: boolean;
};

const productSchema = new Schema<ProductRecord>(
  {
    productId: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    barcode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, trim: true, maxlength: 500 },
    category: { type: String, required: true, trim: true, maxlength: 80, index: true },
    stock: { type: Number, required: true, min: 0, validate: Number.isInteger },
    shopId: { type: String, required: true, trim: true, uppercase: true, index: true },
    isActive: { type: Boolean, required: true, default: true, index: true },
  },
  { timestamps: true },
);

productSchema.index({ shopId: 1, barcode: 1 }, { unique: true });
productSchema.index({ shopId: 1, isActive: 1, stock: 1 });

export const Product = models.Product ?? model<ProductRecord>('Product', productSchema);
