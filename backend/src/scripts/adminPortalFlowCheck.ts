import 'dotenv/config';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { signAccessToken } from '../middleware/auth.js';
import { AiVerification } from '../models/AiVerification.js';
import { ExitPass } from '../models/ExitPass.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { User } from '../models/User.js';

async function runAdminPortalFlowCheck(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters.');

  const suffix = randomUUID().replaceAll('-', '').toUpperCase();
  const shopId = `ADMIN_SHOP_${suffix}`;
  const otherShopId = `ADMIN_OTHER_${suffix}`;
  const emailSuffix = suffix.toLowerCase();
  const emails = [`admin-${emailSuffix}@example.invalid`, `customer-${emailSuffix}@example.invalid`, `guard-${emailSuffix}@example.invalid`, `other-admin-${emailSuffix}@example.invalid`];
  const orderIds = {
    completed: `ADMIN_COMPLETE_${suffix}`,
    flagged: `ADMIN_FLAGGED_${suffix}`,
    failed: `ADMIN_FAILED_${suffix}`,
    pending: `ADMIN_PENDING_${suffix}`,
    otherShop: `ADMIN_PRIVATE_${suffix}`,
  };
  const productIds: string[] = [];
  const barcodeSeed = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`.slice(-10);
  let server: ReturnType<typeof app.listen> | undefined;

  try {
    await mongoose.connect(uri);
    await Shop.create([
      { shopId, name: 'Admin Analytics Market', location: 'Test Aisle' },
      { shopId: otherShopId, name: 'Private Other Market', location: 'Other Location' },
    ]);
    const [salesman, customer, guard, otherSalesman] = await User.create([
      { name: 'Admin Portal Salesman', email: emails[0], passwordHash: 'test-hash', role: 'SALESMAN', shopId },
      { name: 'Admin Portal Customer', email: emails[1], passwordHash: 'test-hash', role: 'CUSTOMER' },
      { name: 'Admin Portal Guard', email: emails[2], passwordHash: 'test-hash', role: 'GUARD', shopId },
      { name: 'Other Shop Salesman', email: emails[3], passwordHash: 'test-hash', role: 'SALESMAN', shopId: otherShopId },
    ]);

    const seedProducts = await Product.create([
      { productId: `ADMIN_SEED_A_${suffix}`, name: 'Admin Fixture Oats', barcode: `91${barcodeSeed}`, price: 50, category: 'Breakfast', stock: 12, shopId },
      { productId: `ADMIN_SEED_LOW_${suffix}`, name: 'Admin Fixture Low Stock', barcode: `92${barcodeSeed}`, price: 25, category: 'Pantry', stock: 2, shopId },
      { productId: `ADMIN_OTHER_PRODUCT_${suffix}`, name: 'Private Other Product', barcode: `93${barcodeSeed}`, price: 999, category: 'Private', stock: 100, shopId: otherShopId },
    ]);
    productIds.push(...seedProducts.map((product) => product.productId));

    const now = new Date();
    const orderItems = [{ productId: seedProducts[0].productId, barcode: seedProducts[0].barcode, name: seedProducts[0].name, category: seedProducts[0].category, image: seedProducts[0].productId, unitPrice: 50, quantity: 2, subtotal: 100 }];
    const createOrder = (orderId: string, status: 'SUCCESS' | 'FAILED' | 'PENDING', shop: string, customerId = customer._id) => ({
      orderId,
      customerId,
      shopId: shop,
      sessionId: `SESSION_${orderId}`,
      items: orderItems,
      subtotalAmount: 100,
      taxRateBps: 0,
      taxAmount: 0,
      discountRateBps: 0,
      discountAmount: 0,
      finalAmount: 100,
      currency: 'INR' as const,
      paymentStatus: status,
      orderStatus: status === 'SUCCESS' ? 'PAID' as const : status === 'FAILED' ? 'PAYMENT_FAILED' as const : 'PENDING_PAYMENT' as const,
      testMode: true,
      ...(status === 'SUCCESS' ? { paidAt: now } : {}),
    });
    await Order.create([
      createOrder(orderIds.completed, 'SUCCESS', shopId),
      createOrder(orderIds.flagged, 'SUCCESS', shopId),
      createOrder(orderIds.failed, 'FAILED', shopId),
      createOrder(orderIds.pending, 'PENDING', shopId),
      createOrder(orderIds.otherShop, 'SUCCESS', otherShopId, otherSalesman._id),
    ]);
    await AiVerification.create([
      { verificationId: `AI_${orderIds.completed}`, transactionId: orderIds.completed, status: 'VERIFIED', anomalyScore: 2, reasons: [], engineVersion: 'transparent-rules-v1', createdAt: now },
      { verificationId: `AI_${orderIds.flagged}`, transactionId: orderIds.flagged, status: 'CHECK_REQUIRED', anomalyScore: 82, reasons: ['Unusual quantity pattern', 'Cart and amount mismatch requires review'], engineVersion: 'transparent-rules-v1', createdAt: now },
    ]);
    await ExitPass.create([
      { exitPassId: `PASS_${orderIds.completed}`, customerId: customer._id, shopId, sessionId: `SESSION_${orderIds.completed}`, orderId: orderIds.completed, tokenHash: `hash_${suffix}_completed`, tokenCiphertext: 'cipher', tokenIv: 'iv', tokenAuthTag: 'tag', status: 'USED', expiresAt: new Date(now.getTime() + 60_000), verifiedAt: now, verifiedByGuardId: guard._id, createdAt: now },
      { exitPassId: `PASS_${orderIds.flagged}`, customerId: customer._id, shopId, sessionId: `SESSION_${orderIds.flagged}`, orderId: orderIds.flagged, tokenHash: `hash_${suffix}_flagged`, tokenCiphertext: 'cipher', tokenIv: 'iv', tokenAuthTag: 'tag', status: 'CHECK_REQUIRED', expiresAt: new Date(now.getTime() + 60_000), checkRequiredAt: now, checkRequiredByGuardId: guard._id, createdAt: now },
    ]);

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string', 'API did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;
    const salesmanToken = signAccessToken({ id: String(salesman._id), role: 'SALESMAN' });
    const customerToken = signAccessToken({ id: String(customer._id), role: 'CUSTOMER' });
    const guardToken = signAccessToken({ id: String(guard._id), role: 'GUARD' });
    const otherSalesmanToken = signAccessToken({ id: String(otherSalesman._id), role: 'SALESMAN' });

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

    assert.equal((await call('/api/admin/dashboard')).status, 401, 'admin APIs require authentication');
    assert.equal((await call('/api/admin/dashboard', { token: customerToken })).status, 403, 'customers cannot access admin dashboard');
    assert.equal((await call('/api/admin/products', { token: customerToken })).status, 403, 'customers cannot manage products');
    assert.equal((await call('/api/admin/dashboard', { token: guardToken })).status, 403, 'guards cannot access admin dashboard');
    assert.equal((await call('/api/admin/products', { method: 'POST', token: guardToken, body: {} })).status, 403, 'guards cannot use admin product management');

    const dashboard = await call('/api/admin/dashboard', { token: salesmanToken });
    assert.equal(dashboard.status, 200, 'salesman can open dashboard');
    assert.equal(dashboard.body.shop.shopId, shopId);
    assert.equal(dashboard.body.stats.totalProducts, 2);
    assert.equal(dashboard.body.stats.activeProducts, 2);
    assert.equal(dashboard.body.stats.totalInventoryUnits, 14);
    assert.equal(dashboard.body.stats.todayOrders, 4);
    assert.equal(dashboard.body.stats.todaySales, 200);
    assert.equal(dashboard.body.stats.completedTransactions, 1);
    assert.equal(dashboard.body.stats.pendingTransactions, 2, 'pending payment plus CHECK_REQUIRED transaction are counted once each');
    assert.equal(dashboard.body.stats.lowStockProducts, 1);
    assert.deepEqual(dashboard.body.lowStockItems.map((product: { productId: string }) => product.productId), [seedProducts[1].productId]);

    const allProducts = await call('/api/admin/products', { token: salesmanToken });
    assert.equal(allProducts.status, 200);
    assert.equal(allProducts.body.products.length, 2, 'list is scoped to salesman shop');
    assert.equal((await call(`/api/admin/products/${seedProducts[2].productId}`, { token: salesmanToken })).status, 404, 'cross-shop product details are hidden');
    const searchedProducts = await call('/api/admin/products?search=fixture%20oat', { token: salesmanToken });
    assert.equal(searchedProducts.body.products.length, 1, 'product search matches name');
    assert.equal(searchedProducts.body.products[0].productId, seedProducts[0].productId);
    assert.equal((await call(`/api/admin/products?search=${encodeURIComponent(otherShopId)}`, { token: salesmanToken })).body.products.length, 0, 'search cannot escape shop scope');

    assert.equal((await call('/api/admin/products', { method: 'POST', token: salesmanToken, body: { name: '', barcode: '1234', price: -1, category: '', stock: -1 } })).status, 400, 'invalid product fields are rejected');
    assert.equal((await call('/api/admin/products', { method: 'POST', token: salesmanToken, body: { name: 'Missing fields' } })).status, 400, 'required fields are validated');
    const duplicate = await call('/api/admin/products', { method: 'POST', token: salesmanToken, body: { name: 'Duplicate Barcode', barcode: seedProducts[0].barcode, price: 10, category: 'Test', stock: 1 } });
    assert.equal(duplicate.status, 409, 'duplicate shop barcode is rejected');
    const addedProduct = await call('/api/admin/products', { method: 'POST', token: salesmanToken, body: { name: 'Admin Portal Added Product', barcode: `94${barcodeSeed}`, price: 32.5, category: 'Test Aisle', stock: 7 } });
    assert.equal(addedProduct.status, 201, 'salesman can add a valid product');
    assert.equal(addedProduct.body.product.shopId, shopId, 'new product is assigned to the authenticated shop');
    assert.equal(addedProduct.body.product.isActive, true);
    productIds.push(addedProduct.body.product.productId);
    const invalidStock = await call(`/api/admin/products/${seedProducts[0].productId}`, { method: 'PATCH', token: salesmanToken, body: { stock: -3 } });
    assert.equal(invalidStock.status, 400, 'negative stock update is rejected');
    const invalidPrice = await call(`/api/admin/products/${seedProducts[0].productId}`, { method: 'PATCH', token: salesmanToken, body: { price: -0.01 } });
    assert.equal(invalidPrice.status, 400, 'negative price update is rejected');
    const updatedStock = await call(`/api/admin/products/${seedProducts[0].productId}`, { method: 'PATCH', token: salesmanToken, body: { stock: 18 } });
    assert.equal(updatedStock.status, 200, 'salesman can update stock');
    assert.equal(updatedStock.body.product.stock, 18);
    assert.equal(updatedStock.body.product.shopId, shopId, 'shop assignment cannot be changed through product input');
    const archived = await call(`/api/admin/products/${addedProduct.body.product.productId}`, { method: 'DELETE', token: salesmanToken });
    assert.equal(archived.status, 200, 'salesman can remove a product from active inventory');
    assert.equal(archived.body.product.isActive, false, 'deletion archives the product to preserve paid-order snapshots');

    const analytics = await call('/api/admin/sales?period=7d', { token: salesmanToken });
    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.summary.totalSales, 200);
    assert.equal(analytics.body.summary.numberOfOrders, 4);
    assert.equal(analytics.body.summary.paidOrders, 2);
    assert.equal(analytics.body.summary.completedOrders, 1);
    assert.equal(analytics.body.summary.cancelledOrFailedOrders, 1);
    assert.equal(analytics.body.summary.averageOrderValue, 100);
    assert.equal(analytics.body.topSellingProducts[0].quantitySold, 4);
    assert.equal((await call('/api/admin/sales?period=30d', { token: salesmanToken })).status, 400, 'unsupported analytics periods are rejected');

    const transactions = await call('/api/admin/transactions', { token: salesmanToken });
    assert.equal(transactions.status, 200);
    assert.equal(transactions.body.total, 4, 'transaction history only lists this shop');
    assert(!transactions.body.transactions.some((item: { orderId: string }) => item.orderId === orderIds.otherShop));
    const details = await call(`/api/admin/transactions/${orderIds.flagged}`, { token: salesmanToken });
    assert.equal(details.status, 200);
    assert.equal(details.body.transaction.paymentStatus, 'SUCCESS');
    assert.equal(details.body.transaction.totalAmount, 100);
    assert.equal(details.body.transaction.numberOfItems, 2);
    assert.equal(details.body.transaction.items[0].name, 'Admin Fixture Oats');
    assert.equal(details.body.transaction.items[0].quantity, 2, 'transaction detail returns complete paid cart');
    assert.equal(details.body.transaction.aiVerificationStatus, 'CHECK_REQUIRED');
    assert.equal(details.body.transaction.anomalyScore, 82);
    assert.deepEqual(details.body.transaction.reasons, ['Unusual quantity pattern', 'Cart and amount mismatch requires review']);
    assert.equal((await call(`/api/admin/transactions/${orderIds.otherShop}`, { token: salesmanToken })).status, 404, 'cross-shop transaction details are hidden');
    const flagged = await call('/api/admin/transactions/flagged', { token: salesmanToken });
    assert.equal(flagged.status, 200);
    assert.equal(flagged.body.total, 1);
    assert.equal(flagged.body.transactions[0].orderId, orderIds.flagged);
    assert.equal(flagged.body.transactions[0].aiVerificationStatus, 'CHECK_REQUIRED');
    assert.equal(flagged.body.transactions[0].anomalyScore, 82);
    assert.equal(flagged.body.transactions[0].paymentStatus, 'SUCCESS');
    assert.equal(flagged.body.transactions[0].exitStatus, 'CHECK_REQUIRED');
    assert.deepEqual(flagged.body.transactions[0].reasons, ['Unusual quantity pattern', 'Cart and amount mismatch requires review']);

    assert.equal((await call('/api/admin/dashboard', { token: otherSalesmanToken })).body.shop.shopId, otherShopId, 'each salesman receives only their assigned shop scope');
    console.log('PASS admin APIs require SALESMAN authentication and deny customer/guard access');
    console.log('PASS dashboard metrics and low-stock data match seeded MongoDB fixtures');
    console.log('PASS product listing, search, shop isolation, validation, duplicate barcode and stock updates');
    console.log('PASS sales analytics, recent transactions, paid-cart details and CHECK_REQUIRED flags');
    console.log('PASS all management APIs remain scoped to the authenticated salesman shop');
  } finally {
    if (server?.listening) await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    await Promise.all([
      Product.deleteMany({ shopId: { $in: [shopId, otherShopId] } }),
      Order.deleteMany({ orderId: { $in: Object.values(orderIds) } }),
      ExitPass.deleteMany({ orderId: { $in: Object.values(orderIds) } }),
      AiVerification.deleteMany({ transactionId: { $in: Object.values(orderIds) } }),
      Shop.deleteMany({ shopId: { $in: [shopId, otherShopId] } }),
      User.deleteMany({ email: { $in: emails } }),
    ]);
    await mongoose.disconnect();
  }
}

runAdminPortalFlowCheck().catch((error: unknown) => {
  console.error('Admin portal flow check failed:', error);
  process.exitCode = 1;
});
