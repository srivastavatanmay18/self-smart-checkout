import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { ean13FromPrefix, ean13Svg } from '../utils/ean13.js';

const demoProducts = [
  { name: 'Coca-Cola Original Taste 500 ml', category: 'Beverages', price: 40, stock: 40 },
  { name: 'Pepsi Soft Drink 500 ml', category: 'Beverages', price: 40, stock: 30 },
  { name: 'Bisleri Mineral Water 1 L', category: 'Beverages', price: 20, stock: 60 },
  { name: 'Lay’s Classic Salted Chips 52 g', category: 'Snacks', price: 20, stock: 55 },
  { name: 'Kurkure Masala Munch 90 g', category: 'Snacks', price: 30, stock: 22 },
  { name: 'Amul Taaza Toned Milk 500 ml', category: 'Dairy', price: 29, stock: 34 },
  { name: 'Amul Butter 100 g', category: 'Dairy', price: 62, stock: 20 },
  { name: 'Britannia Good Day Cashew Cookies 200 g', category: 'Biscuits', price: 40, stock: 40 },
  { name: 'Parle-G Gluco Biscuits 250 g', category: 'Biscuits', price: 30, stock: 50 },
  { name: 'Maggi 2-Minute Masala Noodles 70 g', category: 'Instant Food', price: 15, stock: 72 },
  { name: 'Tata Salt 1 kg', category: 'Staples', price: 30, stock: 0 },
  { name: 'Aashirvaad Whole Wheat Atta 1 kg', category: 'Staples', price: 65, stock: 18 },
  { name: 'Cadbury Dairy Milk Chocolate 40 g', category: 'Confectionery', price: 40, stock: 30 },
  { name: 'Haldiram’s Bhujia Sev 200 g', category: 'Snacks', price: 70, stock: 16 },
  { name: 'Surf Excel Matic Front Load Detergent 500 g', category: 'Household', price: 125, stock: 9 },
].map((product, index) => ({
  ...product,
  productId: `SHOP_001_PROD_${String(index + 1).padStart(3, '0')}`,
  barcode: ean13FromPrefix(`890100${String(index + 1).padStart(6, '0')}`),
  image: `SHOP_001_PROD_${String(index + 1).padStart(3, '0')}`,
  shopId: 'SHOP_001',
  isActive: true,
}));

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function seedDemoProducts(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');
  await mongoose.connect(uri);
  const shop = await Shop.findOne({ shopId: 'SHOP_001', isActive: true });
  if (!shop) throw new Error('Seed SHOP_001 first by running npm run seed:shop.');

  for (const product of demoProducts) {
    await Product.findOneAndUpdate(
      { productId: product.productId },
      { $set: product },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  const outputDirectory = resolve(process.cwd(), 'demo-data');
  await mkdir(outputDirectory, { recursive: true });
  const cards = demoProducts.map((product) => `
    <article class="label">
      <h2>${escapeHtml(product.name)}</h2>
      <p>₹${product.price.toFixed(2)} · ${escapeHtml(product.category)} · ${product.stock > 0 ? `In stock (${product.stock})` : 'Out of stock'}</p>
      ${ean13Svg(product.barcode)}
      <p class="number">${product.barcode}</p>
    </article>`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SHOP_001 demo barcode labels</title>
<style>
  *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172b24;margin:24px}h1{font-size:24px;margin-bottom:4px}.intro{color:#53665d;margin-top:0}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.label{border:1px solid #bccbc2;border-radius:8px;padding:12px;break-inside:avoid;min-height:154px}.label h2{font-size:14px;min-height:34px;margin:0 0 5px}.label p{font-size:11px;margin:4px 0}.label svg{display:block;width:100%;height:76px;margin-top:4px}.label .number{text-align:center;font-family:monospace;font-size:12px;letter-spacing:2px}.out{color:#9a4332;font-weight:bold}@media print{body{margin:10mm}.grid{grid-template-columns:repeat(3,1fr);gap:5mm}.label{min-height:40mm;border-radius:0}}
</style></head><body><h1>SRHU Supermarket · SHOP_001</h1><p class="intro">Demo barcode labels. Print at 100% scale or scan from a second screen. One seeded product is intentionally out of stock.</p><main class="grid">${cards}</main></body></html>`;
  const outputPath = resolve(outputDirectory, 'SHOP_001-product-barcodes.html');
  await writeFile(outputPath, html, 'utf8');
  console.log(`Seeded ${demoProducts.length} products for ${shop.name} (${shop.shopId}).`);
  console.log(`Printable barcode labels: ${outputPath}`);
}

seedDemoProducts()
  .catch((error: unknown) => {
    console.error('Could not seed demo products:', error instanceof Error ? error.name : 'UnknownError');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
