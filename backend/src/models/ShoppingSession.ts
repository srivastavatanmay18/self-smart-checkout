import { Schema, model, models, Types } from 'mongoose';

export const SHOPPING_SESSION_STATUSES = ['ACTIVE', 'READY_FOR_EXIT', 'COMPLETED'] as const;
export type ShoppingSessionStatus = (typeof SHOPPING_SESSION_STATUSES)[number];

export type ShoppingCartItemRecord = {
  productId: string;
  barcode: string;
  name: string;
  price: number;
  category: string;
  quantity: number;
};

export type ShoppingSessionRecord = {
  sessionId: string;
  customerId: Types.ObjectId;
  shopId: string;
  status: ShoppingSessionStatus;
  items: ShoppingCartItemRecord[];
  pendingOrderId?: string;
  readyForExitAt?: Date;
  completedOrderId?: string;
  startedAt: Date;
  updatedAt: Date;
};

const shoppingCartItemSchema = new Schema<ShoppingCartItemRecord>(
  {
    productId: { type: String, required: true },
    barcode: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  },
  { _id: false },
);

const shoppingSessionSchema = new Schema<ShoppingSessionRecord>(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    shopId: { type: String, required: true, trim: true, uppercase: true, index: true },
    status: { type: String, required: true, enum: SHOPPING_SESSION_STATUSES, default: 'ACTIVE', index: true },
    items: { type: [shoppingCartItemSchema], default: [] },
    pendingOrderId: { type: String, trim: true, index: true },
    startedAt: { type: Date, required: true, default: Date.now },
    readyForExitAt: { type: Date },
    completedOrderId: { type: String, trim: true, index: true },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

export const ShoppingSession = models.ShoppingSession
  ?? model<ShoppingSessionRecord>('ShoppingSession', shoppingSessionSchema);
