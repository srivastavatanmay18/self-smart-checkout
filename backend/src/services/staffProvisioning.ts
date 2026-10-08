import bcrypt from 'bcrypt';
import { Shop } from '../models/Shop.js';
import { toPublicUser, User, type PublicUser, type UserRole } from '../models/User.js';

export type StaffRole = Extract<UserRole, 'GUARD' | 'SALESMAN'>;

export type StaffProvisioningInput = {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
  shopId: string;
};

export type StaffProvisioningResult = { user: PublicUser; created: boolean };

const BCRYPT_ROUNDS = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Backend-only account provisioning; this is intentionally not exposed as a public API. */
export async function provisionStaffAccount(input: StaffProvisioningInput): Promise<StaffProvisioningResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const shopId = input.shopId.trim().toUpperCase();

  if (name.length < 2 || name.length > 100) {
    throw new Error('Staff name must be between 2 and 100 characters.');
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error('A valid staff email address is required.');
  }
  if (input.password.length < 12 || Buffer.byteLength(input.password, 'utf8') > 72) {
    throw new Error('Staff passwords must be 12–72 bytes long.');
  }
  if (input.role !== 'GUARD' && input.role !== 'SALESMAN') {
    throw new Error('Only GUARD and SALESMAN accounts can be provisioned.');
  }
  if (!shopId) throw new Error('A shopId is required for staff accounts.');

  const shop = await Shop.findOne({ shopId, isActive: true }).select('shopId');
  if (!shop) throw new Error(`Active shop ${shopId} was not found.`);

  const existing = await User.findOne({ email }).select('+tokenVersion');
  if (existing && existing.role !== input.role) {
    throw new Error('An account with this email already exists with a different role; refusing to change account role.');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  if (existing) {
    existing.name = name;
    existing.shopId = shopId;
    existing.passwordHash = passwordHash;
    existing.tokenVersion = (existing.tokenVersion ?? 0) + 1;
    await existing.save();
    return { user: toPublicUser(existing), created: false };
  }

  try {
    const user = await User.create({ name, email, passwordHash, role: input.role, shopId });
    return { user: toPublicUser(user), created: true };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      throw new Error('An account with this email was created concurrently; check the account and retry.');
    }
    throw error;
  }
}
