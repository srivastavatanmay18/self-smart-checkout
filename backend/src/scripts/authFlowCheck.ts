import 'dotenv/config';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { Shop } from '../models/Shop.js';
import { User, type UserRole } from '../models/User.js';
import { provisionStaffAccount } from '../services/staffProvisioning.js';

const password = 'AuthFlowCheck2026!';
const roles: { role: UserRole; portal: string }[] = [
  { role: 'CUSTOMER', portal: 'customer' },
  { role: 'GUARD', portal: 'guard' },
  { role: 'SALESMAN', portal: 'admin' },
];

async function runAuthFlowCheck(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters.');
  }

  const suffix = randomUUID();
  const shopId = `AUTH_SHOP_${suffix.toUpperCase()}`;
  const otherShopId = `AUTH_OTHER_SHOP_${suffix.toUpperCase()}`;
  const accounts = roles.map(({ role }) => ({
    name: `Auth check ${role}`,
    email: `${role.toLowerCase()}-${suffix}@example.invalid`,
    role,
    ...(role === 'GUARD' ? { shopId } : role === 'SALESMAN' ? { shopId: otherShopId } : {}),
  }));
  const [customer, guard, admin] = accounts;
  const emails = accounts.map(({ email }) => email);
  const shopIds = [shopId, otherShopId];
  let server: ReturnType<typeof app.listen> | undefined;

  try {
    await mongoose.connect(uri);
    await Shop.create([
      { shopId, name: 'Auth Flow Shop', location: 'Testing' },
      { shopId: otherShopId, name: 'Auth Flow Other Shop', location: 'Testing' },
    ]);
    const [provisionedGuard, provisionedAdmin] = await Promise.all([
      provisionStaffAccount({ name: guard.name, email: guard.email, password, role: 'GUARD', shopId }),
      provisionStaffAccount({ name: admin.name, email: admin.email, password, role: 'SALESMAN', shopId: otherShopId }),
    ]);
    assert.equal(provisionedGuard.created, true);
    assert.equal(provisionedGuard.user.role, 'GUARD');
    assert.equal(provisionedGuard.user.shopId, shopId);
    assert.equal(provisionedAdmin.created, true);
    assert.equal(provisionedAdmin.user.role, 'SALESMAN');
    assert.equal(provisionedAdmin.user.shopId, otherShopId);
    assert.equal('passwordHash' in provisionedGuard.user, false);
    assert.equal('passwordHash' in provisionedAdmin.user, false);

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string', 'API did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;

    async function call(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
      const response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const body = response.status === 204 ? null : await response.json();
      return { status: response.status, body };
    }

    const registered = await call('/api/auth/register', {
      method: 'POST',
      body: { ...customer, password, role: 'SALESMAN' },
    });
    assert.equal(registered.status, 201, 'customer registration should succeed');
    assert.equal(registered.body.user.role, 'CUSTOMER', 'public registration must not assign staff roles');
    assert.equal('passwordHash' in registered.body.user, false, 'password hash must not be returned');
    assert.equal('password' in registered.body.user, false, 'password must not be returned');
    const savedCustomer = await User.findOne({ email: customer.email }).select('+passwordHash');
    assert(savedCustomer?.passwordHash.startsWith('$2'), 'customer password should be stored as a bcrypt hash');
    assert.equal(await bcrypt.compare(password, savedCustomer.passwordHash), true, 'stored bcrypt hash should verify the submitted password');
    await assert.rejects(
      provisionStaffAccount({ name: 'Attempted Promotion', email: customer.email, password, role: 'GUARD', shopId }),
      /refusing to change account role/,
    );
    assert.equal((await User.findOne({ email: customer.email }))?.role, 'CUSTOMER', 'provisioning must never promote a customer');
    await assert.rejects(
      provisionStaffAccount({ name: guard.name, email: guard.email, password, role: 'SALESMAN', shopId: otherShopId }),
      /refusing to change account role/,
    );
    const [storedGuard, storedAdmin] = await Promise.all([
      User.findOne({ email: guard.email }).select('+passwordHash'),
      User.findOne({ email: admin.email }).select('+passwordHash'),
    ]);
    assert(storedGuard?.passwordHash.startsWith('$2'), 'guard password must be bcrypt-hashed');
    assert(storedAdmin?.passwordHash.startsWith('$2'), 'salesman password must be bcrypt-hashed');
    assert.equal(await bcrypt.compare(password, storedGuard.passwordHash), true);
    assert.equal(await bcrypt.compare(password, storedAdmin.passwordHash), true);
    const sessions = new Map<UserRole, string>([['CUSTOMER', registered.body.token]]);

    const duplicate = await call('/api/auth/register', { method: 'POST', body: { ...customer, password } });
    assert.equal(duplicate.status, 409, 'duplicate registration should be rejected');
    const spoofedRoleLogin = await call('/api/auth/login', { method: 'POST', body: { email: customer.email, password, role: 'GUARD' } });
    assert.equal(spoofedRoleLogin.status, 200, 'a client role hint must not block authentication');
    assert.equal(spoofedRoleLogin.body.user.role, 'CUSTOMER', 'the authenticated account role must come from the backend');
    const invalidPassword = await call('/api/auth/login', { method: 'POST', body: { email: customer.email, password: 'WrongPassword2026!' } });
    assert.equal(invalidPassword.status, 401, 'incorrect password should be rejected');
    const noToken = await call('/api/auth/me');
    assert.equal(noToken.status, 401, 'private profile endpoint must require a JWT');

    for (const account of [guard, admin]) {
      const signedIn = await call('/api/auth/login', {
        method: 'POST',
        body: { email: account.email, password },
      });
      assert.equal(signedIn.status, 200, `${account.role} login should succeed`);
      sessions.set(account.role, signedIn.body.token);
    }

    for (const { role, portal } of roles) {
      const token = sessions.get(role);
      assert(token, `${role} session token should exist`);
      const me = await call('/api/auth/me', { token });
      assert.equal(me.status, 200, `${role} should load its profile`);
      assert.equal(me.body.user.role, role);
      if (role === 'GUARD') assert.equal(me.body.user.shopId, shopId, 'guard login is linked to its assigned shop');
      if (role === 'SALESMAN') assert.equal(me.body.user.shopId, otherShopId, 'salesman login is linked to its assigned shop');
      for (const target of roles) {
        const result = await call(`/api/portals/${target.portal}`, { token });
        assert.equal(result.status, target.role === role ? 200 : 403, `${role} access to ${target.role} portal`);
      }
      const revoked = await call('/api/auth/logout', { method: 'POST', token });
      assert.equal(revoked.status, 204, `${role} logout should revoke the token`);
      const afterLogout = await call('/api/auth/me', { token });
      assert.equal(afterLogout.status, 401, `${role} token must stop working after logout`);
    }

    console.log('PASS customer registration creates CUSTOMER and ignores submitted role');
    console.log('PASS bcrypt password hash is persisted and verified');
    console.log('PASS backend-only staff provisioning creates shop-linked GUARD and SALESMAN accounts');
    console.log('PASS provisioning refuses to convert a CUSTOMER or change an existing staff role');
    console.log('PASS customer, guard, and salesman login plus /me');
    console.log('PASS backend portal authorization permits only the matching role');
    console.log('PASS login ignores client role hints and uses the stored account role');
    console.log('PASS missing credentials, duplicate registration, and incorrect passwords are rejected');
    console.log('PASS logout revokes each issued JWT');
  } finally {
    await User.deleteMany({ email: { $in: emails } });
    await Shop.deleteMany({ shopId: { $in: shopIds } });
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    }
    await mongoose.disconnect();
  }
}

runAuthFlowCheck().catch((error: unknown) => {
  console.error('Authentication flow check failed:', error);
  process.exitCode = 1;
});
