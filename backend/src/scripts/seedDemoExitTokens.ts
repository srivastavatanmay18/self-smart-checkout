import 'dotenv/config';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { AiVerification } from '../models/AiVerification.js';
import { ExitPass } from '../models/ExitPass.js';
import { Order, type OrderItemRecord, type PaymentStatus, type OrderStatus } from '../models/Order.js';
import { Product, type ProductRecord } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession, type ShoppingCartItemRecord } from '../models/ShoppingSession.js';
import { User } from '../models/User.js';
import { ensureAnomalyVerification } from '../services/anomalyVerification.js';
import { ensureExitPassForPaidOrder, decryptExitToken } from '../services/exitPassTokens.js';
import { createExitQrPayload } from '../utils/exitQr.js';

const SHOP_ID = process.env.DEMO_EXIT_SHOP_ID?.trim().toUpperCase() || 'SHOP_001';
const CUSTOMER_EMAIL = 'exit-token-demo@srhu.demo';
const CUSTOMER_NAME = 'Exit QR Demo Data';
const PAID_COUNT = 10;
const unpaidExamples = [
  { orderId: 'DEMO_EXIT_PENDING_01', sessionId: 'DEMO_EXIT_SESSION_PENDING_01', status: 'PENDING', label: 'Payment not completed' },
  { orderId: 'DEMO_EXIT_FAILED_01', sessionId: 'DEMO_EXIT_SESSION_FAILED_01', status: 'FAILED', label: 'Payment failed' },
  { orderId: 'DEMO_EXIT_CANCELLED_01', sessionId: 'DEMO_EXIT_SESSION_CANCELLED_01', status: 'CANCELLED', label: 'Payment cancelled' },
] as const;
const paidExamples = Array.from({ length: PAID_COUNT }, (_value, index) => {
  const number = String(index + 1).padStart(2, '0');
  return {
    orderId: `DEMO_EXIT_PAID_${number}`,
    sessionId: `DEMO_EXIT_SESSION_PAID_${number}`,
    number,
  };
});
const managedOrderIds = [...paidExamples.map(({ orderId }) => orderId), ...unpaidExamples.map(({ orderId }) => orderId)];
const managedSessionIds = [...paidExamples.map(({ sessionId }) => sessionId), ...unpaidExamples.map(({ sessionId }) => sessionId)];

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function toOrderItems(products: ProductRecord[], number: number): OrderItemRecord[] {
  const mainProduct = number === 8
    ? products.find((product) => product.stock >= 11)!
    : products[(number - 1) % products.length]!;
  const quantity = number === 8 ? 11 : (number % 3) + 1;
  const items: OrderItemRecord[] = [{
    productId: mainProduct.productId,
    barcode: mainProduct.barcode,
    name: mainProduct.name,
    category: mainProduct.category,
    image: mainProduct.image ?? mainProduct.productId,
    unitPrice: mainProduct.price,
    quantity,
    subtotal: Math.round((mainProduct.price * quantity + Number.EPSILON) * 100) / 100,
    stockAtPayment: mainProduct.stock,
  }];

  if (number % 3 === 0) {
    const secondProduct = products.find((product) => product.productId !== mainProduct.productId);
    if (secondProduct) {
      items.push({
        productId: secondProduct.productId,
        barcode: secondProduct.barcode,
        name: secondProduct.name,
        category: secondProduct.category,
        image: secondProduct.image ?? secondProduct.productId,
        unitPrice: secondProduct.price,
        quantity: 1,
        subtotal: secondProduct.price,
        stockAtPayment: secondProduct.stock,
      });
    }
  }
  return items;
}

function toCartItems(items: OrderItemRecord[]): ShoppingCartItemRecord[] {
  return items.map((item) => ({
    productId: item.productId,
    barcode: item.barcode,
    name: item.name,
    price: item.unitPrice,
    category: item.category,
    quantity: item.quantity,
  }));
}

async function seedDemoExitTokens(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters to encrypt Exit QR tokens.');
  }
  process.env.PAYMENT_MODE = 'sandbox';
  process.env.EXIT_PASS_TTL_MINUTES ||= '1440';

  await mongoose.connect(uri);
  const shop = await Shop.findOne({ shopId: SHOP_ID, isActive: true }).select('shopId name');
  if (!shop) throw new Error(`Active shop ${SHOP_ID} was not found. Run npm run seed:shop first.`);

  const products = await Product.find({ shopId: SHOP_ID, isActive: { $ne: false }, stock: { $gt: 0 } })
    .sort({ productId: 1 }).lean() as unknown as ProductRecord[];
  if (products.length === 0) throw new Error(`No in-stock products found for ${SHOP_ID}. Run npm run seed:products first.`);
  if (!products.some((product) => product.stock >= 11)) {
    throw new Error('At least one in-stock product with 11 or more units is required for the suspicious-quantity demo transaction. Run npm run seed:products first.');
  }

  let customer = await User.findOne({ email: CUSTOMER_EMAIL });
  if (customer && (customer.role !== 'CUSTOMER' || customer.name !== CUSTOMER_NAME)) {
    throw new Error(`The reserved demo email ${CUSTOMER_EMAIL} is already assigned to a different account.`);
  }
  if (!customer) {
    customer = new User({
      name: CUSTOMER_NAME,
      email: CUSTOMER_EMAIL,
      passwordHash: await bcrypt.hash(randomBytes(32).toString('base64url'), 12),
      role: 'CUSTOMER',
    });
    await customer.save();
  }

  // Rebuild only the fixed, clearly named demo fixture records. Other customers' data is untouched.
  await Promise.all([
    ExitPass.deleteMany({ orderId: { $in: managedOrderIds }, customerId: customer._id }),
    AiVerification.deleteMany({ transactionId: { $in: managedOrderIds } }),
    Order.deleteMany({ orderId: { $in: managedOrderIds }, customerId: customer._id }),
    ShoppingSession.deleteMany({ sessionId: { $in: managedSessionIds }, customerId: customer._id }),
  ]);

  const outputDirectory = resolve(process.cwd(), 'demo-data', 'exit-tokens');
  await mkdir(outputDirectory, { recursive: true });
  const paidCards: string[] = [];
  const paidQrPaths: string[] = [];

  for (let index = 0; index < paidExamples.length; index += 1) {
    const demo = paidExamples[index]!;
    const items = toOrderItems(products, index + 1);
    const subtotalAmount = Math.round((items.reduce((sum, item) => sum + item.subtotal, 0) + Number.EPSILON) * 100) / 100;
    const now = new Date(Date.now() - (PAID_COUNT - index) * 4 * 60_000);
    const order = await Order.create({
      orderId: demo.orderId,
      customerId: customer._id,
      shopId: SHOP_ID,
      sessionId: demo.sessionId,
      items,
      subtotalAmount,
      taxRateBps: 0,
      taxAmount: 0,
      discountRateBps: 0,
      discountAmount: 0,
      finalAmount: subtotalAmount,
      currency: 'INR',
      paymentStatus: 'SUCCESS',
      orderStatus: 'PAID',
      testMode: true,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const session = await ShoppingSession.create({
      sessionId: demo.sessionId,
      customerId: customer._id,
      shopId: SHOP_ID,
      status: 'READY_FOR_EXIT',
      items: toCartItems(items),
      completedOrderId: demo.orderId,
      startedAt: new Date(now.getTime() - 8 * 60_000),
      readyForExitAt: now,
      updatedAt: now,
    });

    const exitPass = await ensureExitPassForPaidOrder(order, session);
    const aiVerification = await ensureAnomalyVerification(order, session);
    const tokenRecord = await ExitPass.findOne({ orderId: demo.orderId })
      .select('+tokenCiphertext +tokenIv +tokenAuthTag');
    if (!tokenRecord) throw new Error(`Exit Pass record was not persisted for ${demo.orderId}.`);
    const token = decryptExitToken(tokenRecord);
    const pngPath = resolve(outputDirectory, `${demo.orderId}.png`);
    const qrDataUrl = await QRCode.toDataURL(createExitQrPayload(token), {
      errorCorrectionLevel: 'Q', margin: 2, width: 560,
    });
    await QRCode.toFile(pngPath, createExitQrPayload(token), {
      errorCorrectionLevel: 'Q', margin: 2, width: 720,
    });
    paidQrPaths.push(pngPath);
    paidCards.push(`<article class="pass">
      <div><h2>Paid demo ${demo.number}</h2><p class="meta">${escapeHtml(demo.orderId)}</p>
      <p>${escapeHtml(items.map((item) => `${item.name} × ${item.quantity}`).join(' · '))}</p>
      <p class="meta">${escapeHtml(aiVerification?.status ?? 'NOT ASSESSED')} · Expires ${exitPass.expiresAt.toLocaleString('en-IN')}</p>
      <strong>₹${subtotalAmount.toFixed(2)} · ${items.reduce((sum, item) => sum + item.quantity, 0)} items</strong></div>
      <img alt="Exit QR for ${escapeHtml(demo.orderId)}" src="${qrDataUrl}" />
    </article>`);
  }

  for (const demo of unpaidExamples) {
    const product = products[0]!;
    const item: OrderItemRecord = {
      productId: product.productId,
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      image: product.image ?? product.productId,
      unitPrice: product.price,
      quantity: 1,
      subtotal: product.price,
      stockAtPayment: product.stock,
    };
    const paymentStatus = demo.status as PaymentStatus;
    const orderStatus: OrderStatus = paymentStatus === 'PENDING'
      ? 'PENDING_PAYMENT'
      : paymentStatus === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_CANCELLED';
    const now = new Date();
    const session = await ShoppingSession.create({
      sessionId: demo.sessionId,
      customerId: customer._id,
      shopId: SHOP_ID,
      status: 'ACTIVE',
      items: toCartItems([item]),
      ...(paymentStatus === 'PENDING' ? { pendingOrderId: demo.orderId } : {}),
      startedAt: new Date(now.getTime() - 5 * 60_000),
      updatedAt: now,
    });
    const order = await Order.create({
      orderId: demo.orderId,
      customerId: customer._id,
      shopId: SHOP_ID,
      sessionId: demo.sessionId,
      items: [item],
      subtotalAmount: product.price,
      taxRateBps: 0,
      taxAmount: 0,
      discountRateBps: 0,
      discountAmount: 0,
      finalAmount: product.price,
      currency: 'INR',
      paymentStatus,
      orderStatus,
      testMode: true,
      ...(paymentStatus === 'FAILED' ? { failureReason: 'Demo payment was declined.' } : {}),
      ...(paymentStatus === 'CANCELLED' ? { failureReason: 'Demo payment was cancelled.' } : {}),
      createdAt: now,
      updatedAt: now,
    });
    void order;
    void session;
  }

  const nonPaidRows = unpaidExamples.map((demo) => `<tr><td>${escapeHtml(demo.orderId)}</td><td>${escapeHtml(demo.label)}</td><td>${demo.status}</td><td><strong>No Exit QR</strong> — payment is not successful</td></tr>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Self Smart Checkout · Exit QR Demo Set</title>
<style>
*{box-sizing:border-box}body{font:15px Arial,sans-serif;color:#19352c;margin:24px;max-width:1100px}h1{margin-bottom:6px}.note{color:#53675f;line-height:1.45}.passes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.pass{border:1px solid #c8d5ce;border-radius:12px;padding:14px;display:grid;grid-template-columns:1fr 170px;align-items:center;gap:10px;break-inside:avoid}.pass h2{font-size:17px;margin:0 0 6px}.pass p{margin:7px 0;line-height:1.35}.meta{font-size:12px;color:#60746b;overflow-wrap:anywhere}.pass img{width:100%;height:auto}.nonpaid{margin-top:26px;width:100%;border-collapse:collapse}.nonpaid th,.nonpaid td{padding:10px;border:1px solid #c8d5ce;text-align:left}.nonpaid th{background:#f0f5f2}@media(max-width:700px){.passes{grid-template-columns:1fr}.pass{grid-template-columns:1fr 145px}}@media print{body{margin:10mm}.pass{break-inside:avoid}.nonpaid{break-before:page}}
</style></head><body>
<h1>SRHU Supermarket · Exit QR Demo Set</h1>
<p class="note">${paidExamples.length} paid transactions have valid, temporary Exit QRs for guard scanning. One paid example has an unusual quantity and should show CHECK_REQUIRED. Pending, failed, and cancelled payments are listed below and correctly have no Exit QR. Demo passes expire within 24 hours of generation.</p>
<main class="passes">${paidCards.join('')}</main>
<h2>Payment examples without Exit QR</h2><p class="note">An Exit QR is issued only after backend-confirmed successful payment.</p>
<table class="nonpaid"><thead><tr><th>Order ID</th><th>Example</th><th>Payment</th><th>Exit QR</th></tr></thead><tbody>${nonPaidRows}</tbody></table>
</body></html>`;
  const indexPath = resolve(outputDirectory, 'exit-token-demo-sheet.html');
  await writeFile(indexPath, html, 'utf8');
  console.log(`Seeded ${paidExamples.length} paid demo transactions with active Exit QRs for ${shop.name} (${shop.shopId}).`);
  console.log(`Also seeded ${unpaidExamples.length} pending/failed/cancelled payment examples without Exit QRs.`);
  console.log(`Printable QR sheet: ${indexPath}`);
  console.log(`Individual QR PNGs: ${paidQrPaths.length} files in ${outputDirectory}`);
  console.log(`Demo customer account: ${CUSTOMER_EMAIL} (password is intentionally unavailable; this account exists only to own test transactions).`);
}

seedDemoExitTokens()
  .catch((error: unknown) => {
    console.error('Could not seed demo Exit QRs:', error instanceof Error ? error.name : 'UnknownError');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
