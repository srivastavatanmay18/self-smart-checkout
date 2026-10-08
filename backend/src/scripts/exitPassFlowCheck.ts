import 'dotenv/config';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { signAccessToken } from '../middleware/auth.js';
import { AiVerification } from '../models/AiVerification.js';
import { ExitPass } from '../models/ExitPass.js';
import { Order, type PaymentStatus, type OrderStatus } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession } from '../models/ShoppingSession.js';
import { User } from '../models/User.js';
import { decryptExitToken, encryptExitToken, ensureExitPassForPaidOrder, hashExitToken, isValidExitToken } from '../services/exitPassTokens.js';
import { createExitQrPayload } from '../utils/exitQr.js';
import { analyzeTransaction } from '../ai/anomaly/ruleBasedDetector.js';

async function runExitPassFlowCheck(): Promise<void> {
  const mismatchAssessment = analyzeTransaction({
    orderId: 'RULE_TEST_ORDER',
    items: [{ productId: 'RULE_TEST_PRODUCT', name: 'Rule Test Product', unitPrice: 10, quantity: 1, subtotal: 12 }],
    subtotalAmount: 12,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: 12,
    paymentStatus: 'SUCCESS',
    orderStatus: 'PAID',
  }, [{ productId: 'RULE_TEST_PRODUCT', stock: 5 }], [{ productId: 'RULE_TEST_PRODUCT', price: 10, quantity: 1 }]);
  assert.equal(mismatchAssessment.status, 'CHECK_REQUIRED');
  assert.equal(mismatchAssessment.anomalyScore, 45);
  assert(mismatchAssessment.reasons.some((reason) => /subtotal does not match/i.test(reason)));
  const unpaidAssessment = analyzeTransaction({
    orderId: 'UNPAID_RULE_TEST_ORDER',
    items: [{ productId: 'RULE_TEST_PRODUCT', name: 'Rule Test Product', unitPrice: 10, quantity: 1, subtotal: 10 }],
    subtotalAmount: 10,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: 10,
    paymentStatus: 'PENDING',
    orderStatus: 'PENDING_PAYMENT',
  });
  assert.equal(unpaidAssessment.status, 'CHECK_REQUIRED');
  assert.equal(unpaidAssessment.anomalyScore, 100);
  assert(unpaidAssessment.reasons.some((reason) => /payment is not confirmed/i.test(reason)));

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters.');
  }
  process.env.PAYMENT_MODE = 'sandbox';
  process.env.EXIT_PASS_TTL_MINUTES = '15';
  process.env.CHECKOUT_TAX_RATE_BPS = '0';
  process.env.CHECKOUT_DISCOUNT_RATE_BPS = '0';

  const suffix = randomUUID().replaceAll('-', '').toUpperCase();
  const shopId = `EXIT_SHOP_${suffix}`;
  const otherShopId = `EXIT_OTHER_${suffix}`;
  const customerEmail = `exit-customer-${suffix.toLowerCase()}@example.invalid`;
  const otherCustomerEmail = `exit-other-customer-${suffix.toLowerCase()}@example.invalid`;
  const guardEmail = `exit-guard-${suffix.toLowerCase()}@example.invalid`;
  const otherGuardEmail = `exit-other-guard-${suffix.toLowerCase()}@example.invalid`;
  const unassignedGuardEmail = `exit-unassigned-guard-${suffix.toLowerCase()}@example.invalid`;
  const salesmanEmail = `exit-salesman-${suffix.toLowerCase()}@example.invalid`;
  const mainSessionId = randomUUID();
  const productId = `EXIT_PRODUCT_${suffix}`;
  const orderIds: string[] = [];
  const sessionIds: string[] = [mainSessionId];
  let server: ReturnType<typeof app.listen> | undefined;

  try {
    await mongoose.connect(uri);
    await Shop.create([
      { shopId, name: 'Exit Flow Supermarket', location: 'Test Location' },
      { shopId: otherShopId, name: 'Different Shop', location: 'Other Test Location' },
    ]);
    const [customer, otherCustomer, guard, otherGuard, unassignedGuard, salesman] = await User.create([
      { name: 'Exit Customer', email: customerEmail, passwordHash: 'test', role: 'CUSTOMER' },
      { name: 'Other Exit Customer', email: otherCustomerEmail, passwordHash: 'test', role: 'CUSTOMER' },
      { name: 'Assigned Exit Guard', email: guardEmail, passwordHash: 'test', role: 'GUARD', shopId },
      { name: 'Other Shop Guard', email: otherGuardEmail, passwordHash: 'test', role: 'GUARD', shopId: otherShopId },
      { name: 'Unassigned Exit Guard', email: unassignedGuardEmail, passwordHash: 'test', role: 'GUARD' },
      { name: 'Exit Flow Salesman', email: salesmanEmail, passwordHash: 'test', role: 'SALESMAN', shopId },
    ]);
    await ShoppingSession.create({
      sessionId: mainSessionId,
      customerId: customer._id,
      shopId,
      status: 'ACTIVE',
      items: [{ productId, barcode: '9000000000001', name: 'Exit Flow Tea', price: 40, category: 'Beverages', quantity: 2 }],
    });
    await Product.create({ productId, barcode: '9000000000001', name: 'Exit Flow Tea', price: 40, category: 'Beverages', stock: 5, image: 'SHOP_001_PROD_001', shopId });

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string', 'API did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;
    const customerToken = signAccessToken({ id: String(customer._id), role: 'CUSTOMER' });
    const otherCustomerToken = signAccessToken({ id: String(otherCustomer._id), role: 'CUSTOMER' });
    const guardToken = signAccessToken({ id: String(guard._id), role: 'GUARD' });
    const otherGuardToken = signAccessToken({ id: String(otherGuard._id), role: 'GUARD' });
    const unassignedGuardToken = signAccessToken({ id: String(unassignedGuard._id), role: 'GUARD' });
    const salesmanToken = signAccessToken({ id: String(salesman._id), role: 'SALESMAN' });

    async function call(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
      const response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const body = await response.json().catch(() => null);
      return { status: response.status, body };
    }

    const checkout = await call('/api/sessions/current/checkout', { method: 'POST', token: customerToken });
    assert.equal(checkout.status, 201);
    const orderId = checkout.body.order.orderId as string;
    orderIds.push(orderId);
    assert.equal((await call(`/api/customer/exit-passes/orders/${orderId}`, { token: customerToken })).status, 409);
    assert.equal(await ExitPass.countDocuments({ orderId }), 0, 'no Exit Pass is created before payment succeeds');

    const paid = await call(`/api/orders/${orderId}/payment`, { method: 'POST', token: customerToken, body: { outcome: 'SUCCESS' } });
    assert.equal(paid.status, 200);
    assert.equal(paid.body.order.paymentStatus, 'SUCCESS');
    assert.equal(paid.body.sessionStatus, 'READY_FOR_EXIT');
    assert.equal(paid.body.exitPass.status, 'ACTIVE');
    assert.equal(paid.body.exitPass.expiresAt, (await ExitPass.findOne({ orderId }))?.expiresAt.toISOString());
    const savedAiVerification = await AiVerification.findOne({ transactionId: orderId });
    assert(savedAiVerification, 'payment success persists an anomaly verification');
    assert.equal(savedAiVerification.status, 'VERIFIED');
    assert.equal(savedAiVerification.anomalyScore, 0);
    assert.deepEqual(savedAiVerification.reasons, []);
    assert.equal(savedAiVerification.engineVersion, 'transparent-rules-v1');
    const paidSession = await ShoppingSession.findOne({ sessionId: mainSessionId });
    assert.equal(paidSession?.completedOrderId, orderId);

    const storedPass = await ExitPass.findOne({ orderId }).select('+tokenHash +tokenCiphertext +tokenIv +tokenAuthTag');
    assert(storedPass, 'payment success creates a persisted Exit Pass');
    const rawToken = decryptExitToken(storedPass);
    assert(isValidExitToken(rawToken), 'Exit token is a cryptographically random base64url bearer token');
    assert.equal(rawToken.length, 43, 'Exit token encodes 256 random bits');
    assert.equal(createExitQrPayload(rawToken), rawToken, 'the QR payload is only the opaque token');
    assert.notEqual(storedPass.tokenHash, rawToken, 'the database stores a token hash instead of its raw value');
    assert.notEqual(storedPass.tokenCiphertext, rawToken, 'the recoverable token is encrypted at rest');
    assert.equal(storedPass.customerId.toString(), customer._id.toString());
    assert.equal(storedPass.shopId, shopId);
    assert.equal(storedPass.sessionId, mainSessionId);
    assert.equal(storedPass.orderId, orderId);

    const customerPass = await call(`/api/customer/exit-passes/orders/${orderId}`, { token: customerToken });
    assert.equal(customerPass.status, 200);
    assert.match(customerPass.body.exitPass.qrCode, /^data:image\/png;base64,/);
    assert.equal(customerPass.body.exitPass.status, 'ACTIVE');
    assert.equal(customerPass.body.order.paymentStatus, 'SUCCESS');
    assert.equal(customerPass.body.shop.name, 'Exit Flow Supermarket');
    assert.equal(customerPass.body.aiVerification, undefined, 'the customer Exit Pass response does not expose the guard verification result');
    assert.equal((await call(`/api/customer/exit-passes/orders/${orderId}`, { token: otherCustomerToken })).status, 404);
    assert.equal((await call(`/api/customer/exit-passes/orders/${orderId}`, { token: guardToken })).status, 403);
    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', token: otherCustomerToken, body: { token: rawToken } })).status, 403);
    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', body: { token: rawToken } })).status, 401);
    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', token: customerToken, body: { token: rawToken } })).status, 403);
    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', token: salesmanToken, body: { token: rawToken } })).status, 403);
    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', token: unassignedGuardToken, body: { token: rawToken } })).status, 403);
    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', token: otherGuardToken, body: { token: rawToken } })).status, 403);
    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: randomBytes(32).toString('base64url') } })).status, 404);

    const verified = await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: rawToken } });
    assert.equal(verified.status, 200);
    assert.equal(verified.body.exitPass.canApprove, true);
    assert.equal(verified.body.exitPass.status, 'ACTIVE');
    assert.equal(verified.body.transaction.customerReference, `CUST-${String(customer._id).slice(-8).toUpperCase()}`);
    assert.equal(verified.body.transaction.orderId, orderId);
    assert.equal(verified.body.transaction.shop.name, 'Exit Flow Supermarket');
    assert.deepEqual(verified.body.transaction.items.map((item: { name: string; quantity: number }) => [item.name, item.quantity]), [['Exit Flow Tea', 2]]);
    assert.equal(verified.body.transaction.items[0].image, 'SHOP_001_PROD_001');
    assert.equal(verified.body.transaction.totalAmount, 80);
    assert.equal(verified.body.transaction.totalItemCount, 2);
    assert.equal(verified.body.transaction.paymentStatus, 'SUCCESS');
    assert.equal(verified.body.aiVerification.status, 'VERIFIED');
    assert.equal(verified.body.aiVerification.anomalyScore, 0);
    assert.deepEqual(verified.body.aiVerification.reasons, []);
    assert.match(verified.body.aiVerification.engineVersion, /rules/);
    assert.equal(verified.body.approved, undefined, 'an AI VERIFIED result is not an exit approval');

    async function createLinkedFixture(kind: 'EXPIRED' | 'PENDING' | 'FAILED' | 'CANCELLED') {
      const fixtureSessionId = randomUUID();
      const fixtureOrderId = `EXIT_${kind}_${randomUUID()}`;
      const fixtureToken = randomBytes(32).toString('base64url');
      orderIds.push(fixtureOrderId);
      sessionIds.push(fixtureSessionId);
      const isPaid = kind === 'EXPIRED';
      const paymentStatus: PaymentStatus = isPaid ? 'SUCCESS' : kind;
      const orderStatus: OrderStatus = isPaid ? 'PAID' : kind === 'PENDING' ? 'PENDING_PAYMENT' : kind === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_CANCELLED';
      await ShoppingSession.create({
        sessionId: fixtureSessionId,
        customerId: customer._id,
        shopId,
        status: 'READY_FOR_EXIT',
        items: [{ productId, barcode: '9000000000001', name: 'Exit Flow Tea', price: 40, category: 'Beverages', quantity: 2 }],
        completedOrderId: fixtureOrderId,
      });
      await Order.create({
        orderId: fixtureOrderId,
        customerId: customer._id,
        shopId,
        sessionId: fixtureSessionId,
        items: [{ productId, barcode: '9000000000001', name: 'Exit Flow Tea', category: 'Beverages', unitPrice: 40, quantity: 2, subtotal: 80 }],
        subtotalAmount: 80,
        taxRateBps: 0,
        taxAmount: 0,
        discountRateBps: 0,
        discountAmount: 0,
        finalAmount: 80,
        currency: 'INR',
        paymentStatus,
        orderStatus,
        testMode: true,
        ...(isPaid ? { paidAt: new Date() } : {}),
      });
      const expiresAt = isPaid ? new Date(Date.now() - 60_000) : new Date(Date.now() + 15 * 60_000);
      await ExitPass.create({
        exitPassId: randomUUID(),
        customerId: customer._id,
        shopId,
        sessionId: fixtureSessionId,
        orderId: fixtureOrderId,
        tokenHash: hashExitToken(fixtureToken),
        ...encryptExitToken(fixtureToken),
        status: 'ACTIVE',
        expiresAt,
      });
      return { orderId: fixtureOrderId, token: fixtureToken };
    }

    async function createPaidPassForCheckRequiredFlow() {
      const fixtureSessionId = randomUUID();
      const fixtureOrderId = `EXIT_CHECK_${randomUUID()}`;
      orderIds.push(fixtureOrderId);
      sessionIds.push(fixtureSessionId);
      const fixtureSession = await ShoppingSession.create({
        sessionId: fixtureSessionId,
        customerId: customer._id,
        shopId,
        status: 'READY_FOR_EXIT',
        items: [{ productId, barcode: '9000000000001', name: 'Exit Flow Tea', price: 40, category: 'Beverages', quantity: 12 }],
        completedOrderId: fixtureOrderId,
      });
      const fixtureOrder = await Order.create({
        orderId: fixtureOrderId,
        customerId: customer._id,
        shopId,
        sessionId: fixtureSessionId,
        items: [{ productId, barcode: '9000000000001', name: 'Exit Flow Tea', category: 'Beverages', unitPrice: 40, quantity: 12, subtotal: 480, image: 'SHOP_001_PROD_001' }],
        subtotalAmount: 480,
        taxRateBps: 0,
        taxAmount: 0,
        discountRateBps: 0,
        discountAmount: 0,
        finalAmount: 480,
        currency: 'INR',
        paymentStatus: 'SUCCESS',
        orderStatus: 'PAID',
        testMode: true,
        paidAt: new Date(),
      });
      await ensureExitPassForPaidOrder(fixtureOrder, fixtureSession);
      const secrets = await ExitPass.findOne({ orderId: fixtureOrderId }).select('+tokenHash +tokenCiphertext +tokenIv +tokenAuthTag');
      assert(secrets);
      return { sessionId: fixtureSessionId, orderId: fixtureOrderId, token: decryptExitToken(secrets) };
    }

    const checkFlow = await createPaidPassForCheckRequiredFlow();
    const riskReview = await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: checkFlow.token } });
    assert.equal(riskReview.status, 200);
    assert.equal(riskReview.body.aiVerification.status, 'CHECK_REQUIRED');
    assert(riskReview.body.aiVerification.anomalyScore >= 40);
    assert(riskReview.body.aiVerification.reasons.some((reason: string) => /unusual quantity/i.test(reason)));
    assert(riskReview.body.aiVerification.reasons.some((reason: string) => /stock/i.test(reason)));
    assert.equal(riskReview.body.exitPass.status, 'ACTIVE', 'AI CHECK_REQUIRED does not automatically change or consume the Exit Pass');
    assert.equal(riskReview.body.exitPass.canApprove, true, 'the guard still makes the exit decision after physical comparison');
    const checkRequired = await call('/api/guard/exit-passes/check-required', {
      method: 'POST', token: guardToken, body: { token: checkFlow.token, reason: 'One bag item does not match the paid order.' },
    });
    assert.equal(checkRequired.status, 200);
    assert.equal(checkRequired.body.checkRequired, true);
    assert.equal(checkRequired.body.exitPass.status, 'CHECK_REQUIRED');
    assert.equal(checkRequired.body.aiVerification.status, 'CHECK_REQUIRED');
    assert.equal(checkRequired.body.exitPass.canApprove, false, 'the just-recorded check does not complete or immediately approve the pass');
    assert.equal(checkRequired.body.exitPass.checkRequiredReason, 'One bag item does not match the paid order.');
    assert(checkRequired.body.exitPass.checkRequiredAt);
    assert.equal(checkRequired.body.exitPass.checkRequiredByGuardId, String(guard._id));
    assert.equal((await ShoppingSession.findOne({ sessionId: checkFlow.sessionId }))?.status, 'READY_FOR_EXIT');
    const customerCheckRequiredPass = await call(`/api/customer/exit-passes/orders/${checkFlow.orderId}`, { token: customerToken });
    assert.equal(customerCheckRequiredPass.status, 200);
    assert.equal(customerCheckRequiredPass.body.exitPass.status, 'CHECK_REQUIRED');
    assert.match(customerCheckRequiredPass.body.exitPass.qrCode, /^data:image\/png;base64,/);
    const continuedInspection = await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: checkFlow.token } });
    assert.equal(continuedInspection.body.exitPass.status, 'CHECK_REQUIRED');
    assert.equal(continuedInspection.body.exitPass.canApprove, true, 'a later physical inspection can continue with the recorded transaction');
    const inspectedApproval = await call('/api/guard/exit-passes/approve', { method: 'POST', token: guardToken, body: { token: checkFlow.token } });
    assert.equal(inspectedApproval.status, 200);
    assert.equal(inspectedApproval.body.exitPass.status, 'USED');
    assert.equal((await ShoppingSession.findOne({ sessionId: checkFlow.sessionId }))?.status, 'COMPLETED');
    assert.equal((await ExitPass.findOne({ orderId: checkFlow.orderId }))?.checkRequiredReason, 'One bag item does not match the paid order.');

    const expired = await createLinkedFixture('EXPIRED');
    const expiredReview = await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: expired.token } });
    assert.equal(expiredReview.status, 200);
    assert.equal(expiredReview.body.exitPass.status, 'EXPIRED');
    assert.equal(expiredReview.body.exitPass.canApprove, false);
    assert.equal((await call('/api/guard/exit-passes/approve', { method: 'POST', token: guardToken, body: { token: expired.token } })).status, 410);

    for (const kind of ['PENDING', 'FAILED', 'CANCELLED'] as const) {
      const unpaid = await createLinkedFixture(kind);
      const review = await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: unpaid.token } });
      assert.equal(review.status, 200);
      assert.equal(review.body.transaction.paymentStatus, kind);
      assert.equal(review.body.aiVerification, null, `${kind} transaction must not be treated as AI VERIFIED`);
      assert.equal(await AiVerification.findOne({ transactionId: unpaid.orderId }), null, `${kind} transaction does not persist a trusted verification`);
      assert.equal(review.body.exitPass.canApprove, false, `${kind} order cannot be approved`);
      assert.match(review.body.exitPass.blockedReason, /not successfully paid/i);
      const rejectedApproval = await call('/api/guard/exit-passes/approve', { method: 'POST', token: guardToken, body: { token: unpaid.token } });
      assert.equal(rejectedApproval.status, 409);
      assert.equal((await ExitPass.findOne({ orderId: unpaid.orderId }))?.status, 'ACTIVE');
    }

    const approved = await call('/api/guard/exit-passes/approve', { method: 'POST', token: guardToken, body: { token: rawToken } });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.approved, true);
    assert.equal(approved.body.exitPass.status, 'USED');
    assert(approved.body.exitPass.verifiedAt);
    const completedSession = await ShoppingSession.findOne({ sessionId: mainSessionId });
    assert.equal(completedSession?.status, 'COMPLETED');
    const passAfterApproval = await ExitPass.findOne({ orderId });
    assert.equal(passAfterApproval?.status, 'USED');
    assert(passAfterApproval?.verifiedAt);
    assert.equal(passAfterApproval?.verifiedByGuardId?.toString(), guard._id.toString());
    assert.equal(await AiVerification.countDocuments({ transactionId: orderId }), 1, 'repeated review/approval reuses the stored assessment');
    const reusedReview = await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: rawToken } });
    assert.equal(reusedReview.status, 200);
    assert.equal(reusedReview.body.exitPass.status, 'USED');
    assert.equal(reusedReview.body.exitPass.canApprove, false);
    const reusedApproval = await call('/api/guard/exit-passes/approve', { method: 'POST', token: guardToken, body: { token: rawToken } });
    assert.equal(reusedApproval.status, 409, 'a used QR cannot be approved twice');
    assert.equal((await call(`/api/customer/exit-passes/orders/${orderId}`, { token: customerToken })).body.exitPass.qrCode, null);

    console.log('PASS successful sandbox payment creates one hashed, encrypted, unique Exit Pass only after payment success');
    console.log('PASS customer can retrieve the Exit QR and only the owning customer can view it');
    console.log('PASS valid Exit QR is scoped to an assigned guard shop and returns the paid transaction summary');
    console.log('PASS invalid, expired, unpaid, failed, cancelled, and already-used passes cannot be approved');
    console.log('PASS guard approval records the verifier/time, completes the session, and prevents QR reuse');
    console.log('PASS customer ownership, authentication, guard role, and assigned-shop checks protect AI/transaction reviews');
    console.log('PASS unpaid, failed, and cancelled orders are not returned or stored as VERIFIED assessments');
    console.log('PASS CHECK_REQUIRED records guard/time/reason without completing the session, keeps the customer QR available, and supports approval after a later inspection');
    console.log('PASS anomaly rules persist VERIFIED/CHECK_REQUIRED outcomes and show decision-support results without auto-approving an exit');
    console.log('PASS pricing inconsistency rule produces a clear CHECK_REQUIRED reason');
  } finally {
    await AiVerification.deleteMany({ transactionId: { $in: orderIds } });
    await ExitPass.deleteMany({ orderId: { $in: orderIds } });
    await Order.deleteMany({ orderId: { $in: orderIds } });
    await ShoppingSession.deleteMany({ sessionId: { $in: sessionIds } });
    await Product.deleteMany({ productId });
    await Shop.deleteMany({ shopId: { $in: [shopId, otherShopId] } });
    await User.deleteMany({ email: { $in: [customerEmail, otherCustomerEmail, guardEmail, otherGuardEmail, unassignedGuardEmail, salesmanEmail] } });
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    }
    await mongoose.disconnect();
  }
}

runExitPassFlowCheck().catch((error: unknown) => {
  console.error('Exit Pass flow check failed:', error);
  process.exitCode = 1;
});
