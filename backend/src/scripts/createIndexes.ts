import 'dotenv/config';
import mongoose from 'mongoose';
import { AiVerification } from '../models/AiVerification.js';
import { ExitPass } from '../models/ExitPass.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { ShoppingSession } from '../models/ShoppingSession.js';
import { User } from '../models/User.js';

const indexedModels = [User, Shop, Product, ShoppingSession, Order, ExitPass, AiVerification];

async function createIndexes(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Configure backend/.env or the deployment environment first.');

  await mongoose.connect(uri, { autoIndex: false });
  for (const model of indexedModels) {
    await model.createIndexes();
    console.log(`Ensured declared indexes for ${model.modelName}.`);
  }
  console.log('Index creation completed. Existing data and undeclared indexes were not deleted.');
}

void createIndexes()
  .catch((error: unknown) => {
    console.error('Could not create database indexes:', error instanceof Error ? error.name : 'UnknownError');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
