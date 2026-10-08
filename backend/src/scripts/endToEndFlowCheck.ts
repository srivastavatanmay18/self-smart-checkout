import 'dotenv/config';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { AiVerification } from '../models/AiVerification.js';
import { ExitPass } from '../models/ExitPass.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession } from '../models/ShoppingSession.js';
import { User } from '../models/User.js';
import { decryptExitToken } from '../services/exitPassTokens.js';

async function runEndToEndFlowCheck(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters.');
  process.env.PAYMENT_MODE = 'sandbox';
  process.env.CHECKOUT_TAX_RATE_BPS = '0';
  process.env.CHECKOUT_DISCOUNT_RATE_BPS = '0';
  process.env.EXIT_PASS_TTL_MINUTES = '15';

  const suffix = randomUUID().replaceAll('-', '').toUpperCase();
  const shopId = `E2E_SHOP_${suffix}`;
  const otherShopId = `E2E_OTHER_${suffix}`;
  const password = 'EndToEndDemo2026!';
  const emails = [
    `e2e-customer-${suffix.toLowerCase()}@example.invalid`,
    `e2e-second-customer-${suffix.toLowerCase()}@example.invalid`,
    `e2e-guard-${suffix.toLowerCase()}@example.invalid`,
    `e2e-other-guard-${suffix.toLowerCase()}@example.invalid`,
    `e2e-salesman-${suffix.toLowerCase()}@example.invalid`,
    `e2e-other-salesman-${suffix.toLowerCase()}@example.invalid`,
  ];
  const orderIds: string[] = [];
  const sessionIds: string[] = [];
  let server: ReturnType<typeof app.listen> | undefined;

  try {
    await mongoose.connect(uri);
    const [shop, otherShop] = await Shop.create([
      { shopId, name: 'End-to-End Demo Market', location: 'Checkout Test Aisle' },
      { shopId: otherShopId, name: 'Other Demo Market', location: 'Other Aisle' },
    ]);
    const passwordHash = await bcrypt.hash(password, 10);
    const [customer, secondCustomer, guard, otherGuard, salesman, otherSalesman] = await User.create([
      { name: 'End-to-End Customer', email: emails[0], passwordHash, role: 'CUSTOMER' },
      { name: 'End-to-End Second Customer', email: emails[1], passwordHash, role: 'CUSTOMER' },
      { name: 'End-to-End Guard', email: emails[2], passwordHash, role: 'GUARD', shopId },
      { name: 'Other Shop Guard', email: emails[3], passwordHash, role: 'GUARD', shopId: otherShopId },
      { name: 'End-to-End Salesman', email: emails[4], passwordHash, role: 'SALESMAN', shopId },
      { name: 'Other Shop Salesman', email: emails[5], passwordHash, role: 'SALESMAN', shopId: otherShopId },
    ]);
    const barcodeSeed = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(-10);
    const [tea, water, bulkProduct] = await Product.create([
      { productId: `E2E_TEA_${suffix}`, name: 'End-to-End Tea', barcode: `91${barcodeSeed}`, price: 15, category: 'Beverages', stock: 10, image: 'SHOP_001_PROD_001', shopId },
      { productId: `E2E_WATER_${suffix}`, name: 'End-to-End Water', barcode: `92${barcodeSeed}`, price: 8, category: 'Beverages', stock: 6, image: 'SHOP_001_PROD_002', shopId },
      { productId: `E2E_BULK_${suffix}`, name: 'End-to-End Bulk Rice', barcode: `93${barcodeSeed}`, price: 2, category: 'Pantry', stock: 30, image: 'SHOP_001_PROD_003', shopId },
    ]);

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
      return { status: response.status, body: await response.json().catch(() => null) };
    }

    async function login(email: string, expectedRole: 'CUSTOMER' | 'GUARD' | 'SALESMAN'): Promise<string> {
      const result = await call('/api/auth/login', { method: 'POST', body: { email, password } });
      assert.equal(result.status, 200, `${expectedRole} can log in`);
      assert.equal(result.body.user.role, expectedRole);
      return result.body.token as string;
    }

    const customerToken = await login(emails[0], 'CUSTOMER');
    const secondCustomerToken = await login(emails[1], 'CUSTOMER');
    const guardToken = await login(emails[2], 'GUARD');
    const otherGuardToken = await login(emails[3], 'GUARD');
    const salesmanToken = await login(emails[4], 'SALESMAN');
    const otherSalesmanToken = await login(emails[5], 'SALESMAN');

    const identified = await call('/api/shops/identify', { method: 'POST', token: customerToken, body: { token: shop.permanentQrToken } });
    assert.equal(identified.status, 200, 'customer identifies the permanent Shop QR');
    assert.equal(identified.body.shop.shopId, shopId);
    const started = await call('/api/sessions', { method: 'POST', token: customerToken, body: { shopId, token: shop.permanentQrToken } });
    assert.equal(started.status, 201, 'identified customer starts the shop session');
    const normalSessionId = started.body.session.sessionId as string;
    sessionIds.push(normalSessionId);
    assert.equal(started.body.session.customerId, undefined, 'public session response does not expose private customer id');

    assert.equal((await call('/api/sessions/current/checkout', { method: 'POST', token: customerToken })).status, 400, 'empty cart cannot checkout');
    assert.equal((await call(`/api/products/barcode/${tea.barcode}`, { token: customerToken })).body.product.name, tea.name, 'customer scans product barcode and receives product details');
    assert.equal((await call('/api/sessions/current/cart/items', { method: 'POST', token: customerToken, body: { productId: tea.productId } })).status, 200);
    assert.equal((await call(`/api/sessions/current/cart/items/${tea.productId}`, { method: 'PATCH', token: customerToken, body: { quantity: 2 } })).body.cart.totalAmount, 30, 'quantity update recalculates cart total');
    assert.equal((await call('/api/sessions/current/cart/items', { method: 'POST', token: customerToken, body: { productId: water.productId } })).status, 200);
    assert.equal((await call(`/api/sessions/current/cart/items/${water.productId}`, { method: 'DELETE', token: customerToken })).status, 200, 'customer can remove a cart item');

    const adminStock = await call(`/api/admin/products/${tea.productId}`, { method: 'PATCH', token: salesmanToken, body: { stock: 10 } });
    assert.equal(adminStock.status, 200, 'salesman inventory changes are applied to the same product used by checkout');
    tea.price = 18;
    await tea.save();
    const checkout = await call('/api/sessions/current/checkout', { method: 'POST', token: customerToken });
    assert.equal(checkout.status, 201);
    const normalOrderId = checkout.body.order.orderId as string;
    orderIds.push(normalOrderId);
    assert.equal(checkout.body.order.customerId, undefined, 'checkout response does not expose private customer id');
    assert.equal(checkout.body.order.shopId, shopId);
    assert.equal(checkout.body.order.sessionId, normalSessionId);
    assert.equal(checkout.body.order.items[0].unitPrice, 18, 'checkout refreshes price from the database');
    assert.equal(checkout.body.order.finalAmount, 36, 'order total matches the refreshed cart and payment amount');

    tea.price = 19;
    await tea.save();
    const stalePricePayment = await call(`/api/orders/${normalOrderId}/payment`, { method: 'POST', token: customerToken, body: { outcome: 'SUCCESS' } });
    assert.equal(stalePricePayment.status, 409, 'price changes after checkout block payment at the old amount');
    assert.equal(stalePricePayment.body.order.paymentStatus, 'FAILED');
    assert.equal((await Product.findOne({ productId: tea.productId }))?.stock, 10, 'failed price validation does not consume stock');
    tea.price = 18;
    await tea.save();

    const failedPayment = await call(`/api/orders/${normalOrderId}/payment`, { method: 'POST', token: customerToken, body: { outcome: 'FAILED' } });
    assert.equal(failedPayment.status, 200);
    assert.equal(failedPayment.body.order.paymentStatus, 'FAILED');
    assert.equal(failedPayment.body.sessionStatus, 'ACTIVE');
    assert.equal(await ExitPass.countDocuments({ orderId: normalOrderId }), 0, 'failed payment creates no exit pass');
    const cancelledPayment = await call(`/api/orders/${normalOrderId}/payment`, { method: 'POST', token: customerToken, body: { outcome: 'CANCELLED' } });
    assert.equal(cancelledPayment.status, 200);
    assert.equal(cancelledPayment.body.order.paymentStatus, 'CANCELLED');
    assert.equal(cancelledPayment.body.sessionStatus, 'ACTIVE');
    assert.equal(await ExitPass.countDocuments({ orderId: normalOrderId }), 0, 'cancelled payment creates no exit pass');

    const concurrentPayments = await Promise.all([
      call(`/api/orders/${normalOrderId}/payment`, { method: 'POST', token: customerToken, body: { outcome: 'SUCCESS' } }),
      call(`/api/orders/${normalOrderId}/payment`, { method: 'POST', token: customerToken, body: { outcome: 'SUCCESS' } }),
    ]);
    assert(concurrentPayments.every((attempt) => attempt.status === 200 || attempt.status === 409), 'concurrent duplicate payment attempts are serialized');
    const paid = concurrentPayments.find((attempt) => attempt.status === 200);
    assert(paid, 'one or more idempotent successful payment responses are returned');
    assert.equal(paid.status, 200);
    assert.equal(paid.body.order.paymentStatus, 'SUCCESS');
    assert.equal(paid.body.order.finalAmount, 36);
    assert.equal(paid.body.sessionStatus, 'READY_FOR_EXIT');
    assert.equal((await Product.findOne({ productId: tea.productId }))?.stock, 8, 'successful payment decreases stock exactly by the purchased quantity');
    const savedNormalOrder = await Order.findOne({ orderId: normalOrderId });
    assert.equal(String(savedNormalOrder?.customerId), String(customer._id));
    assert.equal(savedNormalOrder?.shopId, shopId);
    assert.equal(savedNormalOrder?.sessionId, normalSessionId);
    assert.equal(savedNormalOrder?.stockDeductedAt instanceof Date, true);
    assert.equal(savedNormalOrder?.items[0].stockAtPayment, 10);
    const lockFields = await Order.findOne({ orderId: normalOrderId }).select('+paymentProcessingId +paymentProcessingAt');
    assert.equal(lockFields?.paymentProcessingId, undefined, 'payment claim is released after finalization');
    const normalPass = await ExitPass.findOne({ orderId: normalOrderId }).select('+tokenHash +tokenCiphertext +tokenIv +tokenAuthTag');
    assert(normalPass, 'successful paid order creates its linked Exit Pass');
    assert.equal(normalPass.shopId, shopId);
    assert.equal(normalPass.sessionId, normalSessionId);
    const customerPass = await call(`/api/customer/exit-passes/orders/${normalOrderId}`, { token: customerToken });
    assert.equal(customerPass.status, 200);
    assert.match(customerPass.body.exitPass.qrCode, /^data:image\/png;base64,/);
    assert.equal(customerPass.body.order.paymentStatus, 'SUCCESS');
    assert.equal(customerPass.body.shop.name, shop.name);
    assert.equal((await call(`/api/customer/exit-passes/orders/${normalOrderId}`, { token: secondCustomerToken })).status, 404, 'customers cannot see another customer’s Exit Pass');
    const normalExitToken = decryptExitToken(normalPass);

    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', token: otherGuardToken, body: { token: normalExitToken } })).status, 403, 'guard assigned to another shop cannot inspect this pass');
    assert.equal((await call('/api/admin/dashboard', { token: customerToken })).status, 403);
    assert.equal((await call('/api/admin/dashboard', { token: guardToken })).status, 403);
    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', token: customerToken, body: { token: normalExitToken } })).status, 403);
    const guardReview = await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: normalExitToken } });
    assert.equal(guardReview.status, 200);
    assert.equal(guardReview.body.transaction.orderId, normalOrderId);
    assert.equal(guardReview.body.transaction.shop.shopId, shopId);
    assert.equal(guardReview.body.transaction.items[0].image, 'SHOP_001_PROD_001');
    assert.equal(guardReview.body.transaction.items[0].name, tea.name);
    assert.equal(guardReview.body.transaction.items[0].quantity, 2);
    assert.equal(guardReview.body.transaction.items[0].unitPrice, 18);
    assert.equal(guardReview.body.transaction.items[0].subtotal, 36);
    assert.equal(guardReview.body.transaction.totalItemCount, 2);
    assert.equal(guardReview.body.transaction.totalAmount, 36);
    assert.equal(guardReview.body.transaction.paymentStatus, 'SUCCESS');
    assert.equal(guardReview.body.aiVerification.status, 'VERIFIED');
    assert.equal(guardReview.body.aiVerification.anomalyScore, 0);
    assert.equal(guardReview.body.approved, undefined, 'AI VERIFIED does not automatically approve physical guard verification');
    assert.equal((await ShoppingSession.findOne({ sessionId: normalSessionId }))?.status, 'READY_FOR_EXIT');
    const normalApproval = await call('/api/guard/exit-passes/approve', { method: 'POST', token: guardToken, body: { token: normalExitToken } });
    assert.equal(normalApproval.status, 200);
    assert.equal(normalApproval.body.approved, true);
    assert.equal((await ShoppingSession.findOne({ sessionId: normalSessionId }))?.status, 'COMPLETED');
    assert.equal((await ExitPass.findOne({ orderId: normalOrderId }))?.verifiedByGuardId?.toString(), String(guard._id));
    assert.equal((await call('/api/guard/exit-passes/approve', { method: 'POST', token: guardToken, body: { token: normalExitToken } })).status, 409, 'approved QR cannot be reused');

    const secondShopScan = await call('/api/shops/identify', { method: 'POST', token: secondCustomerToken, body: { token: shop.permanentQrToken } });
    assert.equal(secondShopScan.status, 200);
    const secondStarted = await call('/api/sessions', { method: 'POST', token: secondCustomerToken, body: { shopId, token: shop.permanentQrToken } });
    assert.equal(secondStarted.status, 201);
    const checkSessionId = secondStarted.body.session.sessionId as string;
    sessionIds.push(checkSessionId);
    assert.equal((await call(`/api/products/barcode/${bulkProduct.barcode}`, { token: secondCustomerToken })).body.product.name, bulkProduct.name);
    assert.equal((await call('/api/sessions/current/cart/items', { method: 'POST', token: secondCustomerToken, body: { productId: bulkProduct.productId } })).status, 200);
    assert.equal((await call(`/api/sessions/current/cart/items/${bulkProduct.productId}`, { method: 'PATCH', token: secondCustomerToken, body: { quantity: 12 } })).body.cart.totalAmount, 24);
    const checkCheckout = await call('/api/sessions/current/checkout', { method: 'POST', token: secondCustomerToken });
    assert.equal(checkCheckout.status, 201);
    const checkOrderId = checkCheckout.body.order.orderId as string;
    orderIds.push(checkOrderId);
    const checkPaid = await call(`/api/orders/${checkOrderId}/payment`, { method: 'POST', token: secondCustomerToken, body: { outcome: 'SUCCESS' } });
    assert.equal(checkPaid.status, 200);
    assert.equal((await Product.findOne({ productId: bulkProduct.productId }))?.stock, 18);
    const aiCheck = await AiVerification.findOne({ transactionId: checkOrderId });
    assert.equal(aiCheck?.status, 'CHECK_REQUIRED');
    assert.equal(aiCheck?.anomalyScore, 45);
    assert(aiCheck?.reasons.some((reason: string) => /unusual quantity/i.test(reason)));
    const checkPass = await ExitPass.findOne({ orderId: checkOrderId }).select('+tokenHash +tokenCiphertext +tokenIv +tokenAuthTag');
    assert(checkPass);
    const checkExitToken = decryptExitToken(checkPass);
    const aiReview = await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: checkExitToken } });
    assert.equal(aiReview.status, 200);
    assert.equal(aiReview.body.aiVerification.status, 'CHECK_REQUIRED');
    assert.equal(aiReview.body.aiVerification.anomalyScore, 45);
    assert.equal(aiReview.body.approved, undefined);
    const mismatch = await call('/api/guard/exit-passes/check-required', { method: 'POST', token: guardToken, body: { token: checkExitToken, reason: 'Bag contents do not match the displayed paid cart.' } });
    assert.equal(mismatch.status, 200);
    assert.equal(mismatch.body.checkRequired, true);
    assert.equal((await ExitPass.findOne({ orderId: checkOrderId }))?.status, 'CHECK_REQUIRED');
    assert.equal((await ShoppingSession.findOne({ sessionId: checkSessionId }))?.status, 'READY_FOR_EXIT', 'manual mismatch keeps the session open for follow-up');
    assert.equal((await call(`/api/customer/exit-passes/orders/${checkOrderId}`, { token: secondCustomerToken })).body.exitPass.status, 'CHECK_REQUIRED');
    assert.equal((await call('/api/guard/exit-passes/verify', { method: 'POST', token: otherGuardToken, body: { token: checkExitToken } })).status, 403);
    const followUpReview = await call('/api/guard/exit-passes/verify', { method: 'POST', token: guardToken, body: { token: checkExitToken } });
    assert.equal(followUpReview.status, 200);
    assert.equal(followUpReview.body.exitPass.status, 'CHECK_REQUIRED');
    assert.equal(followUpReview.body.aiVerification.status, 'CHECK_REQUIRED');
    assert.equal(followUpReview.body.approved, undefined);
    const followUpApproval = await call('/api/guard/exit-passes/approve', { method: 'POST', token: guardToken, body: { token: checkExitToken } });
    assert.equal(followUpApproval.status, 200, 'guard can approve after follow-up physical inspection');
    assert.equal((await ShoppingSession.findOne({ sessionId: checkSessionId }))?.status, 'COMPLETED');
    assert.equal((await call('/api/guard/exit-passes/approve', { method: 'POST', token: guardToken, body: { token: checkExitToken } })).status, 409);

    const adminDashboard = await call('/api/admin/dashboard', { token: salesmanToken });
    assert.equal(adminDashboard.status, 200);
    assert.equal(adminDashboard.body.stats.todayOrders, 2);
    assert.equal(adminDashboard.body.stats.todaySales, 60);
    assert.equal(adminDashboard.body.stats.completedTransactions, 2);
    const adminSales = await call('/api/admin/sales?period=today', { token: salesmanToken });
    assert.equal(adminSales.status, 200);
    assert.equal(adminSales.body.summary.paidOrders, 2);
    assert.equal(adminSales.body.summary.totalSales, 60);
    assert.equal(adminSales.body.summary.completedOrders, 2);
    const flagged = await call('/api/admin/transactions/flagged', { token: salesmanToken });
    assert(flagged.body.transactions.some((transaction: { orderId: string; aiVerificationStatus: string; anomalyScore: number }) => transaction.orderId === checkOrderId && transaction.aiVerificationStatus === 'CHECK_REQUIRED' && transaction.anomalyScore === 45));
    const adminDetail = await call(`/api/admin/transactions/${checkOrderId}`, { token: salesmanToken });
    assert.equal(adminDetail.status, 200);
    assert.equal(adminDetail.body.transaction.items[0].quantity, 12);
    assert.equal(adminDetail.body.transaction.paymentStatus, 'SUCCESS');
    assert.equal(adminDetail.body.transaction.aiVerificationStatus, 'CHECK_REQUIRED');
    assert.equal((await call(`/api/admin/transactions/${checkOrderId}`, { token: otherSalesmanToken })).status, 404, 'salesman cannot access another shop transaction');
    assert.equal((await call('/api/admin/products', { token: otherSalesmanToken })).body.products.length, 0, 'inventory remains scoped to salesman shop');
    assert.equal((await call('/api/admin/transactions', { token: customerToken })).status, 403);

    console.log('PASS customer login, permanent Shop QR identification, active session, product scan, cart update and empty-cart rejection');
    console.log('PASS checkout refreshes current price, rejects post-checkout price changes, and keeps failed/cancelled attempts unpaid');
    console.log('PASS successful payment links order, customer, shop, session, Exit Pass and AI record; stock is deducted once');
    console.log('PASS guard receives complete paid cart and AI review; VERIFIED does not bypass guard approval');
    console.log('PASS CHECK_REQUIRED and guard mismatch remain open for inspection, then follow-up approval completes the session');
    console.log('PASS wrong-shop access, customer ownership, salesman shop isolation, QR reuse and admin analytics checks');
  } finally {
    if (server?.listening) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    await Promise.all([
      ExitPass.deleteMany({ shopId: { $in: [shopId, otherShopId] } }),
      AiVerification.deleteMany({ transactionId: { $in: orderIds } }),
      Order.deleteMany({ orderId: { $in: orderIds } }),
      ShoppingSession.deleteMany({ sessionId: { $in: sessionIds } }),
      Product.deleteMany({ shopId: { $in: [shopId, otherShopId] } }),
      Shop.deleteMany({ shopId: { $in: [shopId, otherShopId] } }),
      User.deleteMany({ email: { $in: emails } }),
    ]);
    await mongoose.disconnect();
  }
}

runEndToEndFlowCheck().catch((error: unknown) => {
  console.error('End-to-end flow check failed:', error);
  process.exitCode = 1;
});
