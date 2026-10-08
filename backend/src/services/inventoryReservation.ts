import type { HydratedDocument } from 'mongoose';
import { Product } from '../models/Product.js';
import type { OrderRecord } from '../models/Order.js';

type OrderDocument = HydratedDocument<OrderRecord>;

export type StockReservationResult =
  | { reserved: true; stockByProduct: Map<string, number>; rollback: () => Promise<void> }
  | { reserved: false; reason: string };

/** Atomically consumes each item's stock after successful sandbox payment is requested. */
export async function reserveOrderStock(order: OrderDocument): Promise<StockReservationResult> {
  const stockByProduct = new Map<string, number>();
  const applied: Array<{ productId: string; quantity: number }> = [];

  for (const item of order.items) {
    const updatedProduct = await Product.findOneAndUpdate(
      {
        shopId: order.shopId,
        productId: item.productId,
        isActive: { $ne: false },
        price: item.unitPrice,
        stock: { $gte: item.quantity },
      },
      { $inc: { stock: -item.quantity } },
      { new: true },
    ).select('productId stock');

    if (!updatedProduct) {
      await restoreAppliedStock(order.shopId, applied);
      const currentProduct = await Product.findOne({ shopId: order.shopId, productId: item.productId }).select('price stock isActive');
      let reason: string;
      if (!currentProduct || currentProduct.isActive === false) reason = `${item.name} is no longer available in this shop.`;
      else if (currentProduct.price !== item.unitPrice) reason = `${item.name}'s price changed. Start checkout again to review the new total.`;
      else reason = `${item.name}: only ${currentProduct.stock} unit(s) remain.`;
      return { reserved: false, reason };
    }

    applied.push({ productId: item.productId, quantity: item.quantity });
    if (!stockByProduct.has(item.productId)) stockByProduct.set(item.productId, updatedProduct.stock + item.quantity);
  }

  return {
    reserved: true,
    stockByProduct,
    rollback: () => restoreAppliedStock(order.shopId, applied),
  };
}

async function restoreAppliedStock(shopId: string, items: Array<{ productId: string; quantity: number }>): Promise<void> {
  for (const item of items.reverse()) {
    await Product.updateOne({ shopId, productId: item.productId }, { $inc: { stock: item.quantity } });
  }
}
