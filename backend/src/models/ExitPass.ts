import { Schema, model, models, Types } from 'mongoose';

export const EXIT_PASS_STATUSES = ['ACTIVE', 'CHECK_REQUIRED', 'USED', 'EXPIRED', 'REVOKED'] as const;
export type ExitPassStatus = (typeof EXIT_PASS_STATUSES)[number];

export type ExitPassRecord = {
  exitPassId: string;
  customerId: Types.ObjectId;
  shopId: string;
  sessionId: string;
  orderId: string;
  tokenHash: string;
  tokenCiphertext: string;
  tokenIv: string;
  tokenAuthTag: string;
  status: ExitPassStatus;
  createdAt?: Date;
  expiresAt: Date;
  verifiedAt?: Date;
  verifiedByGuardId?: Types.ObjectId;
  checkRequiredAt?: Date;
  checkRequiredByGuardId?: Types.ObjectId;
  checkRequiredReason?: string;
};

const exitPassSchema = new Schema<ExitPassRecord>(
  {
    exitPassId: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    shopId: { type: String, required: true, trim: true, uppercase: true, index: true },
    sessionId: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    tokenCiphertext: { type: String, required: true, select: false },
    tokenIv: { type: String, required: true, select: false },
    tokenAuthTag: { type: String, required: true, select: false },
    status: { type: String, required: true, enum: EXIT_PASS_STATUSES, default: 'ACTIVE', index: true },
    expiresAt: { type: Date, required: true, index: true },
    verifiedAt: { type: Date },
    verifiedByGuardId: { type: Schema.Types.ObjectId, ref: 'User' },
    checkRequiredAt: { type: Date },
    checkRequiredByGuardId: { type: Schema.Types.ObjectId, ref: 'User' },
    checkRequiredReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const ExitPass = models.ExitPass ?? model<ExitPassRecord>('ExitPass', exitPassSchema);
