import { Schema, model, models } from 'mongoose';

export const USER_ROLES = ['CUSTOMER', 'GUARD', 'SALESMAN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  shopId?: string;
};

export type UserRecord = {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  shopId?: string;
  tokenVersion?: number;
};

const userSchema = new Schema<UserRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: USER_ROLES, index: true },
    shopId: { type: String, trim: true },
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

export const User = models.User ?? model<UserRecord>('User', userSchema);

export function toPublicUser(user: { _id: unknown; name: string; email: string; role: UserRole; shopId?: string }): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    ...(user.shopId ? { shopId: user.shopId } : {}),
  };
}
