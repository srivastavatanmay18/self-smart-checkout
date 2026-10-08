import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { generateShopQrToken, Shop } from '../models/Shop.js';
import { createShopQrPayload } from '../utils/shopQr.js';

const demoShop = {
  shopId: 'SHOP_001',
  name: 'SRHU Supermarket',
  location: 'Dehradun, Uttarakhand',
};

async function seedDemoShop(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Copy backend/.env.example to backend/.env first.');

  await mongoose.connect(uri);
  const existing = await Shop.findOne({ shopId: demoShop.shopId }).select('+permanentQrToken');
  const shop = existing ?? await Shop.create({
    ...demoShop,
    permanentQrToken: generateShopQrToken(),
    isActive: true,
  });
  if (shop.name !== demoShop.name || shop.location !== demoShop.location) {
    shop.name = demoShop.name;
    shop.location = demoShop.location;
    await shop.save();
  }

  const qrDirectory = resolve(process.cwd(), 'demo-data');
  const qrPath = resolve(qrDirectory, 'SHOP_001-permanent-qr.png');
  await mkdir(qrDirectory, { recursive: true });
  await QRCode.toFile(qrPath, createShopQrPayload(shop.permanentQrToken), {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 720,
  });
  console.log(`Ready: ${shop.name} (${shop.shopId})`);
  console.log(`Permanent Shop QR: ${qrPath}`);
}

seedDemoShop()
  .catch((error: unknown) => {
    console.error('Could not seed the demo shop:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
