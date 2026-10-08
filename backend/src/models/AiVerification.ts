import { Schema, model, models } from 'mongoose';
import type { AnomalyStatus } from '../ai/anomaly/types.js';

export type AiVerificationRecord = {
  verificationId: string;
  transactionId: string;
  status: AnomalyStatus;
  anomalyScore: number;
  reasons: string[];
  engineVersion: string;
  createdAt?: Date;
  updatedAt?: Date;
};

const aiVerificationSchema = new Schema<AiVerificationRecord>(
  {
    verificationId: { type: String, required: true, unique: true, index: true },
    transactionId: { type: String, required: true, unique: true, index: true },
    status: { type: String, required: true, enum: ['VERIFIED', 'CHECK_REQUIRED'], index: true },
    anomalyScore: { type: Number, required: true, min: 0, max: 100, validate: Number.isInteger },
    reasons: { type: [String], required: true, default: [] },
    engineVersion: { type: String, required: true, maxlength: 80 },
  },
  { timestamps: true, collection: 'ai_verifications' },
);

aiVerificationSchema.index({ status: 1, createdAt: -1 });

export const AiVerification = models.AiVerification
  ?? model<AiVerificationRecord>('AiVerification', aiVerificationSchema);
