import 'dotenv/config';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { validateRuntimeConfiguration } from '../config/environment.js';
import { signAccessToken } from '../middleware/auth.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession } from '../models/ShoppingSession.js';
import { User } from '../models/User.js';

async function runSecurityHardeningCheck(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  const jwtSecret = process.env.JWT_SECRET;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters.');

  const suffix = randomUUID().replaceAll('-', '').toUpperCase();
  const shopId = `SECURITY_SHOP_${suffix}`;
  const otherShopId = `SECURITY_OTHER_${suffix}`;
  const customerEmail = `security-customer-${suffix.toLowerCase()}@example.invalid`;
  const otherCustomerEmail = `security-other-customer-${suffix.toLowerCase()}@example.invalid`;
  const guardEmail = `security-guard-${suffix.toLowerCase()}@example.invalid`;
  const salesmanEmail = `security-salesman-${suffix.toLowerCase()}@example.invalid`;
  const unassignedEmail = `security-unassigned-${suffix.toLowerCase()}@example.invalid`;
  const orderId = `SECURITY_ORDER_${suffix}`;
  const sessionId = `SECURITY_SESSION_${suffix}`;
  let server: ReturnType<typeof app.listen> | undefined;

  try {
    const safeProductionConfig = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://mongo.example.invalid/self-smart-checkout',
      JWT_SECRET: 'phase-12-config-test-secret-with-enough-length-001',
      CORS_ORIGINS: 'https://checkout.example.invalid',
      PAYMENT_MODE: 'sandbox',
    };
    assert.doesNotThrow(() => validateRuntimeConfiguration(safeProductionConfig), 'complete secure production configuration is accepted');
    assert.throws(() => validateRuntimeConfiguration({ ...safeProductionConfig, JWT_SECRET: 'short' }), /JWT_SECRET/);
    assert.throws(() => validateRuntimeConfiguration({ ...safeProductionConfig, DEMO_GUARD_PASSWORD: 'configured' }), /demo staff passwords/);
    assert.throws(() => validateRuntimeConfiguration({ ...safeProductionConfig, CORS_ORIGINS: 'http://localhost:8081' }), /HTTPS origins/);
    assert.throws(() => validateRuntimeConfiguration({ ...safeProductionConfig, PAYMENT_MODE: 'live' }), /sandbox payment only/);
    assert.throws(() => validateRuntimeConfiguration({ ...safeProductionConfig, MONGODB_URI: '' }), /missing required variables/);

    await mongoose.connect(uri);
    await Shop.create([
      { shopId, name: 'Security Check Shop', location: 'Test Location' },
      { shopId: otherShopId, name: 'Private Shop', location: 'Other Location' },
    ]);
    const [customer, otherCustomer, guard, salesman, unassignedSalesman] = await User.create([
      { name: 'Security Test Customer', email: customerEmail, passwordHash: 'fixture', role: 'CUSTOMER' },
      { name: 'Other Security Customer', email: otherCustomerEmail, passwordHash: 'fixture', role: 'CUSTOMER' },
      { name: 'Security Test Guard', email: guardEmail, passwordHash: 'fixture', role: 'GUARD', shopId },
      { name: 'Security Test Salesman', email: salesmanEmail, passwordHash: 'fixture', role: 'SALESMAN', shopId },
      { name: 'Unassigned Salesman', email: unassignedEmail, passwordHash: 'fixture', role: 'SALESMAN' },
    ]);
    const otherProduct = await Product.create({
      productId: `SECURITY_PRODUCT_${suffix}`,
      name: 'Private Shop Product',
      barcode: `91${Date.now().toString().slice(-10)}`,
      price: 10,
      category: 'Test',
      stock: 2,
      shopId: otherShopId,
    });
    await Order.create({
      orderId,
      customerId: customer._id,
      shopId: otherShopId,
      sessionId,
      items: [{ productId: otherProduct.productId, barcode: otherProduct.barcode, name: otherProduct.name, category: otherProduct.category, unitPrice: 10, quantity: 1, subtotal: 10 }],
      subtotalAmount: 10,
      taxRateBps: 0,
      taxAmount: 0,
      discountRateBps: 0,
      discountAmount: 0,
      finalAmount: 10,
      currency: 'INR',
      paymentStatus: 'PENDING',
      orderStatus: 'PENDING_PAYMENT',
      testMode: true,
    });
    await ShoppingSession.create({ sessionId, customerId: customer._id, shopId: otherShopId, status: 'ACTIVE' });

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string', 'API did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;
    const customerToken = signAccessToken({ id: String(customer._id), role: 'CUSTOMER' });
    const otherCustomerToken = signAccessToken({ id: String(otherCustomer._id), role: 'CUSTOMER' });
    const guardToken = signAccessToken({ id: String(guard._id), role: 'GUARD' });
    const salesmanToken = signAccessToken({ id: String(salesman._id), role: 'SALESMAN' });
    const unassignedToken = signAccessToken({ id: String(unassignedSalesman._id), role: 'SALESMAN' });
    const expiredToken = jwt.sign({ role: 'CUSTOMER', version: 0 }, jwtSecret, { subject: String(customer._id), expiresIn: -1, algorithm: 'HS256' });
    const malformedSubjectToken = jwt.sign({ role: 'CUSTOMER', version: 0 }, jwtSecret, { subject: 'malformed-id', expiresIn: '1h', algorithm: 'HS256' });

    async function call(path: string, options: { method?: string; body?: string | unknown; token?: string; rawBody?: boolean } = {}) {
      const body = options.body;
      const response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        ...(body === undefined ? {} : { body: options.rawBody ? String(body) : JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    }

    const health = await call('/api/health');
    assert.equal(health.status, 200, 'liveness endpoint is reachable');
    assert.equal(health.body.status, 'ok');
    assert.equal(health.body.database, 'connected');
    assert.equal(Object.hasOwn(health.body, 'JWT_SECRET'), false);
    assert.equal(Object.hasOwn(health.body, 'connectionString'), false);
    const readiness = await call('/api/health/ready');
    assert.equal(readiness.status, 200, 'readiness endpoint requires the connected database');
    assert.equal(readiness.body.status, 'ready');

    assert.equal((await call('/api/admin/dashboard')).status, 401, 'missing bearer token is rejected');
    assert.equal((await call('/api/admin/dashboard', { token: 'not.a.jwt' })).status, 401, 'malformed bearer token is rejected');
    assert.equal((await call('/api/portals/customer', { token: expiredToken })).status, 401, 'expired JWT is rejected');
    assert.equal((await call('/api/portals/customer', { token: malformedSubjectToken })).status, 401, 'signed token with malformed user ID is rejected safely');
    assert.equal((await call('/api/admin/dashboard', { token: customerToken })).status, 403, 'wrong role is denied by the backend');
    assert.equal((await call('/api/admin/dashboard', { token: guardToken })).status, 403);
    assert.equal((await call('/api/admin/products', { method: 'POST', token: guardToken, body: {} })).status, 403);
    assert.equal((await call(`/api/admin/products/${otherProduct.productId}`, { token: salesmanToken })).status, 404, 'cross-shop product is not disclosed');
    assert.equal((await call(`/api/admin/transactions/${orderId}`, { token: salesmanToken })).status, 404, 'cross-shop transaction is not disclosed');
    assert.equal((await call(`/api/admin/products/%24where`, { token: salesmanToken })).status, 400, 'malformed product ID is rejected before database lookup');
    assert.equal((await call(`/api/orders/${orderId}/payment`, { method: 'POST', token: otherCustomerToken, body: { outcome: 'SUCCESS' } })).status, 404, 'another customer cannot submit a payment for the order');
    assert.equal((await call(`/api/shops/${shopId}/qr`, { token: unassignedToken })).status, 403, 'an unassigned salesman cannot request any shop QR');

    const directStatus = await call('/api/orders/SECURITY_MISSING/payment', { method: 'POST', token: customerToken, body: { paymentStatus: 'SUCCESS' } });
    assert.equal(directStatus.status, 400, 'client-supplied paymentStatus is not a supported payment outcome');
    assert.equal(await Order.countDocuments({ orderId, paymentStatus: 'SUCCESS' }), 0, 'client input cannot mark a stored order paid');
    assert.equal((await call('/api/orders/%24ne/payment', { method: 'GET', token: customerToken })).status, 400, 'malformed order IDs are rejected');
    assert.equal((await call('/api/customer/exit-passes/orders/%24ne', { token: customerToken })).status, 400, 'malformed Exit Pass order reference is rejected');
    assert.equal((await call('/api/sessions', { method: 'POST', token: customerToken, body: { shopId: '$where', token: 'invalid' } })).status, 400, 'malformed Shop IDs are rejected');
    assert.equal((await call(`/api/sessions/current/cart/items/${otherProduct.productId}`, { method: 'PATCH', token: customerToken, body: { quantity: -1 } })).status, 400, 'negative cart quantities are rejected');
    const malformedJson = await call('/api/auth/login', { method: 'POST', body: '{', rawBody: true });
    assert.equal(malformedJson.status, 400, 'malformed JSON gets a safe client error');
    assert.equal(malformedJson.body.error, 'Request body must contain valid JSON.');
    const tooLarge = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'large@example.invalid', password: 'x'.repeat(40_000) }), rawBody: true });
    assert.equal(tooLarge.status, 413, 'oversized JSON body is rejected');
    assert(!JSON.stringify(tooLarge.body).includes(jwtSecret), 'safe error responses do not expose configuration secrets');

    const loginAttempts = await Promise.all(Array.from({ length: 21 }, () => call('/api/auth/login', { method: 'POST', body: {} })));
    assert.equal(loginAttempts.filter((attempt) => attempt.status === 400).length, 20);
    const limitedLogin = loginAttempts.find((attempt) => attempt.status === 429);
    assert(limitedLogin, 'repeated login attempts are rate limited');
    assert(limitedLogin.body.error.includes('login'));

    const registrationAttempts = await Promise.all(Array.from({ length: 11 }, () => call('/api/auth/register', { method: 'POST', body: {} })));
    assert.equal(registrationAttempts.filter((attempt) => attempt.status === 400).length, 10);
    assert.equal(registrationAttempts.filter((attempt) => attempt.status === 429).length, 1, 'repeated registration attempts are rate limited');

    const paymentAttempts = await Promise.all(Array.from({ length: 21 }, (_value, index) => call(
      `/api/orders/SECURITY_RATE_${index}/payment`,
      { method: 'POST', token: customerToken, body: { outcome: index === 0 ? 'UNSUPPORTED' : 'FAILED' } },
    )));
    // Three earlier payment-route requests in this test used the same local IP bucket.
    assert.equal(paymentAttempts.filter((attempt) => attempt.status === 400).length, 1, 'unsupported payment states are rejected');
    assert.equal(paymentAttempts.filter((attempt) => attempt.status === 404).length, 16, 'supported sandbox outcomes still require a real owned order');
    assert.equal(paymentAttempts.filter((attempt) => attempt.status === 429).length, 4, 'repeated payment attempts are rate limited');

    const scanAttempts = await Promise.all(Array.from({ length: 121 }, () => call(
      '/api/guard/exit-passes/verify',
      { method: 'POST', token: guardToken, body: { token: 'invalid' } },
    )));
    assert.equal(scanAttempts.filter((attempt) => attempt.status === 400).length, 120);
    assert(scanAttempts.some((attempt) => attempt.status === 429), 'repeated Exit QR scans are rate limited');

    await mongoose.disconnect();
    const notReady = await call('/api/health/ready');
    assert.equal(notReady.status, 503, 'readiness endpoint reports database disconnection');
    assert.equal(notReady.body.status, 'not_ready');
    await mongoose.connect(uri);

    console.log('PASS missing, invalid, expired and malformed-subject JWTs are rejected; roles remain backend-enforced');
    console.log('PASS shop isolation blocks private product, transaction and unassigned-shop QR access');
    console.log('PASS malformed IDs, JSON, oversized payloads and client payment-status injection are rejected safely');
    console.log('PASS login, registration, payment and Exit QR endpoints enforce repeated-request limits');
    console.log('PASS production config rejects missing/unsafe settings; health/readiness endpoints expose no secrets');
  } finally {
    if (server?.listening) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    await Promise.all([
      ShoppingSession.deleteMany({ sessionId }),
      Order.deleteMany({ orderId }),
      Product.deleteMany({ shopId: { $in: [shopId, otherShopId] } }),
      Shop.deleteMany({ shopId: { $in: [shopId, otherShopId] } }),
      User.deleteMany({ email: { $in: [customerEmail, otherCustomerEmail, guardEmail, salesmanEmail, unassignedEmail] } }),
    ]);
    await mongoose.disconnect();
  }
}

runSecurityHardeningCheck().catch((error: unknown) => {
  console.error('Security hardening check failed:', error);
  process.exitCode = 1;
});
