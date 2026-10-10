import 'dotenv/config';
import mongoose from 'mongoose';
import { provisionStaffAccount, type StaffRole } from '../services/staffProvisioning.js';

const legacySharedPassword = process.env.DEMO_ACCOUNT_PASSWORD || undefined;
const demoAccounts: Array<{
  name: string;
  email: string;
  password: string | undefined;
  role: StaffRole;
  shopId: string;
  passwordVariable: string;
}> = [
  {
    name: process.env.DEMO_GUARD_NAME || 'SRHU Guard',
    email: process.env.DEMO_GUARD_EMAIL || 'guard@srhu.demo',
    password: process.env.DEMO_GUARD_PASSWORD || legacySharedPassword,
    role: 'GUARD',
    shopId: process.env.DEMO_GUARD_SHOP_ID || 'SHOP_001',
    passwordVariable: 'DEMO_GUARD_PASSWORD',
  },
  {
    name: process.env.DEMO_SALESMAN_NAME || 'SRHU Store Admin',
    email: process.env.DEMO_SALESMAN_EMAIL || 'admin@srhu.demo',
    password: process.env.DEMO_SALESMAN_PASSWORD || legacySharedPassword,
    role: 'SALESMAN',
    shopId: process.env.DEMO_SALESMAN_SHOP_ID || 'SHOP_001',
    passwordVariable: 'DEMO_SALESMAN_PASSWORD',
  },
];

async function seedAuthAccounts(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  const missingPassword = demoAccounts.find((account) => !account.password);
  if (missingPassword) {
    throw new Error(`Set ${missingPassword.passwordVariable} in backend/.env (or set DEMO_ACCOUNT_PASSWORD for a shared demo password).`);
  }

  await mongoose.connect(uri);
  for (const account of demoAccounts) {
    const password = account.password;
    if (!password) {
      throw new Error(`Set ${account.passwordVariable} in backend/.env (or set DEMO_ACCOUNT_PASSWORD for a shared demo password).`);
    }
    const result = await provisionStaffAccount({ ...account, password });
    console.log(`${result.created ? 'Created' : 'Updated'} ${result.user.email} (${result.user.role}) for ${result.user.shopId}.`);
  }
}

seedAuthAccounts()
  .catch((error: unknown) => {
    console.error('Could not seed authentication accounts:', error instanceof Error ? error.name : 'UnknownError');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
