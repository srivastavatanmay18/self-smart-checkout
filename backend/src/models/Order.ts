import { Schema, model, models, Types } from 'mongoose';

export const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_STATUSES = ['PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'PAYMENT_CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderItemRecord = {
  productId: string;
  barcode: string;
  name: string;
  category: string;
  image?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  stockAtPayment?: number;
};

export type OrderRecord = {
  orderId: string;
  customerId: Types.ObjectId;
  shopId: string;
  sessionId: string;
  items: OrderItemRecord[];
  subtotalAmount: number;
  taxRateBps: number;
  taxAmount: number;
  discountRateBps: number;
  discountAmount: number;
  finalAmount: number;
  currency: 'INR';
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  testMode: boolean;
  paidAt?: Date;
  stockDeductedAt?: Date;
  paymentProcessingId?: string;
  paymentProcessingAt?: Date;
  failureReason?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

const orderItemSchema = new Schema<OrderItemRecord>(
  {
    productId: { type: String, required: true },
    barcode: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    image: { type: String, trim: true, maxlength: 500 },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    subtotal: { type: Number, required: true, min: 0 },
    stockAtPayment: { type: Number, min: 0, validate: Number.isInteger },
  },
  { _id: false },
);

const orderSchema = new Schema<OrderRecord>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    shopId: { type: String, required: true, trim: true, uppercase: true, index: true },
    sessionId: { type: String, required: true },
    items: { type: [orderItemSchema], required: true, validate: (items: OrderItemRecord[]) => items.length > 0 },
    subtotalAmount: { type: Number, required: true, min: 0 },
    taxRateBps: { type: Number, required: true, min: 0, max: 10_000 },
    taxAmount: { type: Number, required: true, min: 0 },
    discountRateBps: { type: Number, required: true, min: 0, max: 10_000 },
    discountAmount: { type: Number, required: true, min: 0 },
    finalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, enum: ['INR'], default: 'INR' },
    paymentStatus: { type: String, required: true, enum: PAYMENT_STATUSES, default: 'PENDING', index: true },
    orderStatus: { type: String, required: true, enum: ORDER_STATUSES, default: 'PENDING_PAYMENT', index: true },
    testMode: { type: Boolean, required: true, default: true },
    paidAt: { type: Date },
    stockDeductedAt: { type: Date },
    paymentProcessingId: { type: String, select: false },
    paymentProcessingAt: { type: Date, select: false },
    failureReason: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

// Include paymentStatus in the key so the pending-order uniqueness constraint can
// coexist with older deployments' non-unique sessionId_1 index.
orderSchema.index(
  { sessionId: 1, paymentStatus: 1 },
  { unique: true, partialFilterExpression: { paymentStatus: 'PENDING' } },
);
orderSchema.index({ customerId: 1, createdAt: -1 });

export const Order = models.Order ?? model<OrderRecord>('Order', orderSchema);
