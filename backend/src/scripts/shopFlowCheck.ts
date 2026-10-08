import 'dotenv/config';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession } from '../models/ShoppingSession.js';
import { User } from '../models/User.js';
import { createShopQrPayload, SHOP_QR_TYPE, SHOP_QR_VERSION } from '../utils/shopQr.js';

async function runShopFlowCheck(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters.');
  }

  const suffix = randomUUID().replaceAll('-', '').toUpperCase();
  const shopId = `SHOP_CHECK_${suffix}`;
    const emailSuffix = suffix.toLowerCase();
  const passwordHash = await bcrypt.hash('ShopFlowCheck2026!', 10);
  const customerEmail = `customer-${emailSuffix}@example.invalid`;
  const guardEmail = `guard-${emailSuffix}@example.invalid`;
  const adminEmail = `admin-${emailSuffix}@example.invalid`;
  let server: ReturnType<typeof app.listen> | undefined;

  try {
    await mongoose.connect(uri);
    const shop = await Shop.create({ shopId, name: 'Shop Flow Check', location: 'Test Location' });
    const token = shop.permanentQrToken;
    assert.match(token, /^[A-Za-z0-9_-]{40,64}$/, 'new shops receive a random permanent QR token');
    const [customer, guard, admin] = await User.create([
      { name: 'Shop Flow Customer', email: customerEmail, passwordHash, role: 'CUSTOMER' },
      { name: 'Shop Flow Guard', email: guardEmail, passwordHash, role: 'GUARD' },
      { name: 'Shop Flow Admin', email: adminEmail, passwordHash, role: 'SALESMAN', shopId },
    ]);

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string', 'API did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;

    const { signAccessToken } = await import('../middleware/auth.js');
    const customerToken = signAccessToken({ id: String(customer._id), role: 'CUSTOMER' });
    const guardToken = signAccessToken({ id: String(guard._id), role: 'GUARD' });
    const adminToken = signAccessToken({ id: String(admin._id), role: 'SALESMAN' });
    async function authenticatedCall(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
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

    const qrResult = await authenticatedCall(`/api/shops/${shopId}/qr`, { token: adminToken });
    assert.equal(qrResult.status, 200, 'salesman can generate the permanent shop QR');
    assert.equal(qrResult.body.shop.shopId, shopId);
    assert.match(qrResult.body.qrCode, /^data:image\/png;base64,/);
    assert(!('permanentQrToken' in qrResult.body.shop), 'public shop response must omit the raw token');
    const qrData = JSON.parse(createShopQrPayload(token)) as Record<string, unknown>;
    assert.deepEqual(Object.keys(qrData).sort(), ['token', 'type', 'version']);
    assert.equal(qrData.type, SHOP_QR_TYPE);
    assert.equal(qrData.version, SHOP_QR_VERSION);
    assert.equal(qrData.token, token);
    assert(!createShopQrPayload(token).includes(shopId) && !createShopQrPayload(token).includes('Shop Flow Check'));

    assert.equal((await authenticatedCall(`/api/shops/${shopId}/qr`, { token: guardToken })).status, 403);
    assert.equal((await authenticatedCall('/api/shops/identify', { method: 'POST', body: { token } })).status, 401);
    const identified = await authenticatedCall('/api/shops/identify', { method: 'POST', body: { token }, token: customerToken });
    assert.equal(identified.status, 200, 'customer can identify a shop by its permanent QR token');
    assert.deepEqual(identified.body.shop, { shopId, name: shop.name, location: shop.location });
    assert(!('permanentQrToken' in identified.body.shop));
    assert.equal((await authenticatedCall('/api/shops/identify', { method: 'POST', body: { token: randomBytes(32).toString('base64url') }, token: customerToken })).status, 404);
    assert.equal((await authenticatedCall('/api/shops/identify', { method: 'POST', body: { token }, token: guardToken })).status, 403);

    assert.equal((await authenticatedCall('/api/sessions', { method: 'POST', body: { shopId, token: 'invalid' }, token: customerToken })).status, 400);
    assert.equal((await authenticatedCall('/api/sessions', { method: 'POST', body: { shopId: `${shopId}_MISSING`, token }, token: customerToken })).status, 404);
    assert.equal((await authenticatedCall('/api/sessions', { method: 'POST', body: { shopId, token }, token: guardToken })).status, 403);
    const started = await authenticatedCall('/api/sessions', { method: 'POST', body: { shopId, token }, token: customerToken });
    assert.equal(started.status, 201, 'verified shop can start a customer session');
    assert.equal(started.body.session.shopId, shopId);
    assert.equal(started.body.session.status, 'ACTIVE');
    assert(Number.isFinite(Date.parse(started.body.session.startedAt)), 'session has a start time');
    assert.equal(started.body.shop.name, 'Shop Flow Check');
    const savedSession = await ShoppingSession.findOne({ sessionId: started.body.session.sessionId });
    assert(savedSession, 'shopping session should be persisted');
    assert.equal(String(savedSession.customerId), String(customer._id), 'session must be associated with the authenticated customer');
    const current = await authenticatedCall('/api/sessions/current', { token: customerToken });
    assert.equal(current.status, 200);
    assert.equal(current.body.session.sessionId, started.body.session.sessionId);
    assert.equal(current.body.shop.shopId, shopId);

    console.log('PASS salesman QR endpoint creates a QR image containing only version, type, and an opaque token');
    console.log('PASS role checks restrict QR management and shop identification');
    console.log('PASS customer identifies valid shops while invalid tokens are rejected');
    console.log('PASS session creation requires a matching verified shop token and authenticated customer');
    console.log('PASS active session is persisted and can be restored by the customer');
  } finally {
    await ShoppingSession.deleteMany({ shopId });
    await Shop.deleteOne({ shopId });
    await User.deleteMany({ email: { $in: [customerEmail, guardEmail, adminEmail] } });
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    }
    await mongoose.disconnect();
  }
}

runShopFlowCheck().catch((error: unknown) => {
  console.error('Shop and session flow check failed:', error);
  process.exitCode = 1;
});
