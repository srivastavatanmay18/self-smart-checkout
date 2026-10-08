import 'dotenv/config';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { app } from '../app.js';
import { signAccessToken } from '../middleware/auth.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession } from '../models/ShoppingSession.js';
import { User } from '../models/User.js';
import { ean13FromPrefix } from '../utils/ean13.js';

async function runProductCartFlowCheck(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters.');
  }

  const suffix = randomUUID().replaceAll('-', '').toUpperCase();
  const shopId = `CART_CHECK_${suffix}`;
  const otherShopId = `CART_OTHER_${suffix}`;
  const customerEmail = `cart-customer-${suffix.toLowerCase()}@example.invalid`;
  const secondEmail = `cart-second-${suffix.toLowerCase()}@example.invalid`;
  const otherShopEmail = `cart-other-shop-${suffix.toLowerCase()}@example.invalid`;
  const noSessionEmail = `cart-no-session-${suffix.toLowerCase()}@example.invalid`;
  const numericSuffix = String(parseInt(suffix.slice(0, 6), 16) % 1_000_000).padStart(6, '0');
  const barcode = `890199${numericSuffix}`;
  const outOfStockBarcode = `890198${numericSuffix}`;
  const customerSessionId = randomUUID();
  const secondSessionId = randomUUID();
  const otherShopSessionId = randomUUID();
  const productIds = [`CART_PRODUCT_${suffix}`, `CART_OOS_${suffix}`, `CART_OTHER_PRODUCT_${suffix}`];
  let server: ReturnType<typeof app.listen> | undefined;

  try {
    await mongoose.connect(uri);
    const [shop, otherShop] = await Shop.create([
      { shopId, name: 'Cart Flow Shop', location: 'Test Location' },
      { shopId: otherShopId, name: 'Other Cart Shop', location: 'Other Location' },
    ]);
    const [customer, secondCustomer, otherShopCustomer, noSessionCustomer, guard] = await User.create([
      { name: 'Cart Customer', email: customerEmail, passwordHash: 'test', role: 'CUSTOMER' },
      { name: 'Second Cart Customer', email: secondEmail, passwordHash: 'test', role: 'CUSTOMER' },
      { name: 'Other Shop Customer', email: otherShopEmail, passwordHash: 'test', role: 'CUSTOMER' },
      { name: 'No Session Customer', email: noSessionEmail, passwordHash: 'test', role: 'CUSTOMER' },
      { name: 'Cart Guard', email: `cart-guard-${suffix.toLowerCase()}@example.invalid`, passwordHash: 'test', role: 'GUARD' },
    ]);
    await ShoppingSession.create([
      { sessionId: customerSessionId, customerId: customer._id, shopId, status: 'ACTIVE' },
      { sessionId: secondSessionId, customerId: secondCustomer._id, shopId, status: 'ACTIVE' },
      { sessionId: otherShopSessionId, customerId: otherShopCustomer._id, shopId: otherShopId, status: 'ACTIVE' },
    ]);
    await Product.create([
      { productId: productIds[0], barcode, name: 'Demo Apple Juice 1 L', price: 85.5, category: 'Beverages', stock: 3, shopId },
      { productId: productIds[1], barcode: outOfStockBarcode, name: 'Demo Oat Biscuits', price: 55, category: 'Biscuits', stock: 0, shopId },
      { productId: productIds[2], barcode, name: 'Other Shop Juice', price: 90, category: 'Beverages', stock: 12, shopId: otherShopId },
    ]);

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string', 'API did not bind a TCP port');
    const base = `http://127.0.0.1:${address.port}`;
    const tokens = [customer, secondCustomer, otherShopCustomer, noSessionCustomer, guard]
      .map((user) => signAccessToken({ id: String(user._id), role: user.role }));

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

    const customerToken = tokens[0];
    const secondToken = tokens[1];
    const otherShopToken = tokens[2];
    const noSessionToken = tokens[3];
    const guardToken = tokens[4];
    const demoBarcode = ean13FromPrefix('890100000001');
    assert.equal(demoBarcode.length, 13);
    const eanChecksum = [...demoBarcode].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    assert.equal(eanChecksum % 10, 0, 'seed barcode labels use valid EAN-13 checksums');

    assert.equal((await call('/api/sessions/current/cart')).status, 401);
    assert.equal((await call('/api/sessions/current/cart', { token: guardToken })).status, 403);
    const lookup = await call(`/api/products/barcode/${barcode}`, { token: customerToken });
    assert.equal(lookup.status, 200);
    assert.deepEqual(
      { name: lookup.body.product.name, price: lookup.body.product.price, category: lookup.body.product.category, stock: lookup.body.product.stock, availability: lookup.body.product.availability },
      { name: 'Demo Apple Juice 1 L', price: 85.5, category: 'Beverages', stock: 3, availability: 'AVAILABLE' },
    );
    assert.equal((await call(`/api/products/barcode/${barcode}`, { token: guardToken })).status, 403);
    assert.equal((await call(`/api/products/barcode/${barcode}`)).status, 401);
    assert.equal((await call('/api/products/barcode/not-a-barcode', { token: customerToken })).status, 400);
    assert.equal((await call('/api/products/barcode/8901999999999', { token: customerToken })).status, 404);
    assert.equal((await call(`/api/products/barcode/${barcode}`, { token: noSessionToken })).status, 409);

    const otherShopLookup = await call(`/api/products/barcode/${barcode}`, { token: otherShopToken });
    assert.equal(otherShopLookup.status, 200);
    assert.equal(otherShopLookup.body.product.productId, productIds[2], 'barcode lookup uses the active session shop');
    const unavailableLookup = await call(`/api/products/barcode/${outOfStockBarcode}`, { token: customerToken });
    assert.equal(unavailableLookup.status, 200, 'out-of-stock item details can be displayed');
    assert.equal(unavailableLookup.body.product.availability, 'OUT_OF_STOCK');

    const firstAdd = await call('/api/sessions/current/cart/items', {
      method: 'POST', token: customerToken, body: { productId: productIds[0] },
    });
    assert.equal(firstAdd.status, 200);
    assert.equal(firstAdd.body.cart.sessionId, customerSessionId);
    assert.equal(firstAdd.body.cart.shopId, shopId);
    assert.deepEqual(firstAdd.body.cart.items[0], {
      productId: productIds[0], barcode, name: 'Demo Apple Juice 1 L', category: 'Beverages',
      price: 85.5, quantity: 1, subtotal: 85.5,
    });
    const secondAdd = await call('/api/sessions/current/cart/items', {
      method: 'POST', token: customerToken, body: { productId: productIds[0] },
    });
    assert.equal(secondAdd.body.cart.items[0].quantity, 2);
    assert.equal(secondAdd.body.cart.totalAmount, 171);
    const atStockLimit = await call('/api/sessions/current/cart/items', {
      method: 'POST', token: customerToken, body: { productId: productIds[0] },
    });
    assert.equal(atStockLimit.body.cart.items[0].quantity, 3);
    assert.equal((await call('/api/sessions/current/cart/items', {
      method: 'POST', token: customerToken, body: { productId: productIds[0] },
    })).status, 409);
    assert.equal((await call('/api/sessions/current/cart/items', {
      method: 'POST', token: customerToken, body: { productId: productIds[1] },
    })).status, 409, 'out-of-stock product cannot be added');
    assert.equal((await call('/api/sessions/current/cart/items', {
      method: 'POST', token: customerToken, body: { productId: 'NO_SUCH_PRODUCT' },
    })).status, 404);
    assert.equal((await call('/api/sessions/current/cart/items', {
      method: 'POST', token: customerToken, body: { productId: productIds[2] },
    })).status, 404, 'a product from a different shop cannot be added');

    const changed = await call(`/api/sessions/current/cart/items/${productIds[0]}`, {
      method: 'PATCH', token: customerToken, body: { quantity: 2 },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.cart.items[0].quantity, 2);
    assert.equal(changed.body.cart.items[0].subtotal, 171);
    const reloadedCart = await call('/api/sessions/current/cart', { token: customerToken });
    assert.equal(reloadedCart.body.cart.sessionId, customerSessionId);
    assert.equal(reloadedCart.body.cart.totalAmount, 171);
    assert.equal((await call(`/api/sessions/current/cart/items/${productIds[0]}`, {
      method: 'PATCH', token: customerToken, body: { quantity: 4 },
    })).status, 409);
    assert.equal((await call(`/api/sessions/current/cart/items/${productIds[0]}`, {
      method: 'PATCH', token: customerToken, body: { quantity: 0 },
    })).status, 400);

    const secondCustomerCart = await call('/api/sessions/current/cart', { token: secondToken });
    assert.equal(secondCustomerCart.body.cart.sessionId, secondSessionId);
    assert.equal(secondCustomerCart.body.cart.shopId, shopId);
    assert.equal(secondCustomerCart.body.cart.items.length, 0, 'another customer session has a separate cart');
    assert.equal((await call(`/api/sessions/current/cart/items/${productIds[0]}`, { method: 'DELETE', token: secondToken })).status, 404);

    const persisted = await ShoppingSession.findOne({ sessionId: customerSessionId });
    assert.equal(persisted?.items[0]?.quantity, 2, 'cart changes are persisted on the active session');
    assert.equal(String(persisted?.customerId), String(customer._id), 'cart session is owned by the authenticated customer');
    assert.equal(persisted?.shopId, shopId);
    const removed = await call(`/api/sessions/current/cart/items/${productIds[0]}`, { method: 'DELETE', token: customerToken });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.cart.items.length, 0);
    assert.equal(removed.body.cart.totalAmount, 0);

    console.log('PASS barcode lookup is authenticated and scoped to the customer’s active session shop');
    console.log('PASS seeded EAN-13 barcode values have valid check digits');
    console.log('PASS product details expose stock availability and unknown barcodes are rejected');
    console.log('PASS cart additions, quantity changes, item subtotals, and cart total persist on the session');
    console.log('PASS out-of-stock items and quantities beyond stock are rejected');
    console.log('PASS different shops and customer sessions cannot access each other’s cart items');
  } finally {
    await ShoppingSession.deleteMany({ sessionId: { $in: [customerSessionId, secondSessionId, otherShopSessionId] } });
    await Product.deleteMany({ productId: { $in: productIds } });
    await Shop.deleteMany({ shopId: { $in: [shopId, otherShopId] } });
    await User.deleteMany({ email: { $in: [customerEmail, secondEmail, otherShopEmail, noSessionEmail, `cart-guard-${suffix.toLowerCase()}@example.invalid`] } });
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server?.close((error) => error ? reject(error) : resolve()));
    }
    await mongoose.disconnect();
  }
}

runProductCartFlowCheck().catch((error: unknown) => {
  console.error('Product and cart flow check failed:', error);
  process.exitCode = 1;
});
