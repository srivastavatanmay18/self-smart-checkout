import type { Request, Response } from 'express';
import type { HydratedDocument } from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AiVerification } from '../models/AiVerification.js';
import { ExitPass } from '../models/ExitPass.js';
import { Order, type OrderRecord } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Shop } from '../models/Shop.js';
import { isValidPublicId } from '../utils/publicIds.js';

const LOW_STOCK_THRESHOLD = 5;
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

type OrderDocument = HydratedDocument<OrderRecord>;

function shopIdFromRequest(request: Request): string | null {
  return (request as AuthenticatedRequest).authUser?.shopId ?? null;
}

function safePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function startOfLocalDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function pageSize(value: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) ? Math.min(MAX_PAGE_SIZE, Math.max(1, parsed)) : fallback;
}

function itemCount(order: OrderRecord): number {
  return order.items.reduce((total, item) => total + item.quantity, 0);
}

function transactionRecord(
  order: OrderDocument,
  shop: { shopId: string; name: string },
  pass: { status: string; verifiedAt?: Date } | undefined,
  verification: { status: string; anomalyScore: number; reasons: string[] } | undefined,
) {
  return {
    orderId: order.orderId,
    createdAt: order.createdAt,
    paidAt: order.paidAt ?? null,
    shopId: shop.shopId,
    shopName: shop.name,
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      barcode: item.barcode,
      image: item.image ?? item.productId,
      category: item.category,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    numberOfItems: itemCount(order),
    subtotalAmount: order.subtotalAmount,
    taxAmount: order.taxAmount,
    discountAmount: order.discountAmount,
    totalAmount: order.finalAmount,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    exitStatus: pass?.status ?? 'NOT_CREATED',
    exitVerifiedAt: pass?.verifiedAt ?? null,
    aiVerificationStatus: verification?.status ?? null,
    anomalyScore: verification?.anomalyScore ?? null,
    reasons: verification?.reasons ?? [],
  };
}

async function summarizeOrders(orders: OrderDocument[], shopId: string) {
  const orderIds = orders.map((order) => order.orderId);
  const [shop, passes, verifications] = await Promise.all([
    Shop.findOne({ shopId }).select('shopId name'),
    ExitPass.find({ shopId, orderId: { $in: orderIds } }).select('orderId status verifiedAt'),
    AiVerification.find({ transactionId: { $in: orderIds } }).select('transactionId status anomalyScore reasons'),
  ]);
  const shopSummary = shop ? { shopId: shop.shopId, name: shop.name } : { shopId, name: shopId };
  const passesByOrder = new Map(passes.map((pass) => [pass.orderId, pass]));
  const verificationByOrder = new Map(verifications.map((result) => [result.transactionId, result]));
  return orders.map((order) => transactionRecord(
    order,
    shopSummary,
    passesByOrder.get(order.orderId),
    verificationByOrder.get(order.orderId),
  ));
}

export async function getAdminDashboard(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  if (!shopId) {
    response.status(403).json({ error: 'This salesman account is not assigned to a shop.' });
    return;
  }
  const todayStart = startOfLocalDay();
  const paidOrdersTodayFilter = { shopId, paymentStatus: 'SUCCESS', paidAt: { $gte: todayStart } };
  const [shop, totalProducts, activeProducts, stockAggregation, lowStockCount, lowStockProducts, todayOrders, todaySalesRows, completedTransactionsToday, pendingPaymentOrders, successfulOrderIds] = await Promise.all([
    Shop.findOne({ shopId }).select('shopId name location'),
    Product.countDocuments({ shopId }),
    Product.countDocuments({ shopId, isActive: { $ne: false } }),
    Product.aggregate([{ $match: { shopId, isActive: { $ne: false } } }, { $group: { _id: null, totalUnits: { $sum: '$stock' } } }]),
    Product.countDocuments({ shopId, isActive: { $ne: false }, stock: { $lte: LOW_STOCK_THRESHOLD } }),
    Product.find({ shopId, isActive: { $ne: false }, stock: { $lte: LOW_STOCK_THRESHOLD } }).sort({ stock: 1, name: 1 }).limit(6).select('productId name barcode price category stock image shopId isActive'),
    Order.countDocuments({ shopId, createdAt: { $gte: todayStart } }),
    Order.aggregate([{ $match: paidOrdersTodayFilter }, { $group: { _id: null, totalSales: { $sum: '$finalAmount' } } }]),
    ExitPass.countDocuments({ shopId, status: 'USED', verifiedAt: { $gte: todayStart } }),
    Order.find({ shopId, paymentStatus: 'PENDING' }).select('orderId').lean(),
    Order.find({ shopId, paymentStatus: 'SUCCESS' }).select('orderId').lean(),
  ]);

  const paidIds = successfulOrderIds.map((order) => order.orderId);
  const [openExitPasses, flaggedVerifications] = await Promise.all([
    ExitPass.find({ shopId, orderId: { $in: paidIds }, status: { $in: ['ACTIVE', 'CHECK_REQUIRED'] } }).select('orderId status').lean(),
    AiVerification.find({ transactionId: { $in: paidIds }, status: 'CHECK_REQUIRED' }).select('transactionId').lean(),
  ]);
  const pendingIds = new Set<string>(pendingPaymentOrders.map((order) => order.orderId));
  for (const pass of openExitPasses) pendingIds.add(pass.orderId);
  const openPassIds = new Set(openExitPasses.map((pass) => pass.orderId));
  const passStatuses = await ExitPass.find({ shopId, orderId: { $in: flaggedVerifications.map((item) => item.transactionId) } }).select('orderId status').lean();
  const flaggedPassStatuses = new Map(passStatuses.map((pass) => [pass.orderId, pass.status]));
  for (const result of flaggedVerifications) {
    if (openPassIds.has(result.transactionId) || !['USED', 'REVOKED'].includes(flaggedPassStatuses.get(result.transactionId) ?? '')) {
      pendingIds.add(result.transactionId);
    }
  }

  const todaySales = Number(todaySalesRows[0]?.totalSales ?? 0);
  const pendingTransactions = pendingIds.size;
  response.json({
    shop: shop ? { shopId: shop.shopId, name: shop.name, location: shop.location } : { shopId, name: shopId, location: '' },
    stats: {
      totalProducts,
      activeProducts,
      totalInventoryUnits: Number(stockAggregation[0]?.totalUnits ?? 0),
      todayOrders,
      todaySales,
      completedTransactions: completedTransactionsToday,
      pendingTransactions,
      lowStockProducts: lowStockCount,
      lowStockThreshold: LOW_STOCK_THRESHOLD,
    },
    lowStockItems: lowStockProducts.map((product) => ({
      productId: product.productId,
      name: product.name,
      barcode: product.barcode,
      price: product.price,
      category: product.category,
      stock: product.stock,
      image: product.image ?? null,
      isActive: product.isActive ?? true,
    })),
  });
}

export async function getSalesAnalytics(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  if (!shopId) {
    response.status(403).json({ error: 'This salesman account is not assigned to a shop.' });
    return;
  }
  const period = request.query.period === 'today' ? 'today' : request.query.period === undefined || request.query.period === '7d' ? '7d' : null;
  if (!period) {
    response.status(400).json({ error: 'Period must be today or 7d.' });
    return;
  }
  const now = new Date();
  const start = period === 'today' ? startOfLocalDay(now) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [createdOrders, paidOrders, failedOrders, completedTransactions, recentOrders] = await Promise.all([
    Order.countDocuments({ shopId, createdAt: { $gte: start } }),
    Order.find({ shopId, paymentStatus: 'SUCCESS', paidAt: { $gte: start } }).sort({ paidAt: -1 }).select('orderId items finalAmount paymentStatus orderStatus paidAt createdAt shopId sessionId customerId subtotalAmount taxAmount discountAmount currency testMode'),
    Order.countDocuments({ shopId, paymentStatus: { $in: ['FAILED', 'CANCELLED'] }, createdAt: { $gte: start } }),
    ExitPass.countDocuments({ shopId, status: 'USED', verifiedAt: { $gte: start } }),
    Order.find({ shopId, createdAt: { $gte: start } }).sort({ createdAt: -1 }).limit(10),
  ]);
  const totalSales = Math.round((paidOrders.reduce((sum, order) => sum + order.finalAmount, 0) + Number.EPSILON) * 100) / 100;
  const topProducts = new Map<string, { productId: string; name: string; quantitySold: number; salesAmount: number }>();
  for (const order of paidOrders) {
    for (const item of order.items) {
      const product = topProducts.get(item.productId) ?? { productId: item.productId, name: item.name, quantitySold: 0, salesAmount: 0 };
      product.quantitySold += item.quantity;
      product.salesAmount = Math.round((product.salesAmount + item.subtotal + Number.EPSILON) * 100) / 100;
      topProducts.set(item.productId, product);
    }
  }
  const shop = await Shop.findOne({ shopId }).select('shopId name');
  response.json({
    period,
    from: start,
    to: now,
    summary: {
      totalSales,
      numberOfOrders: createdOrders,
      paidOrders: paidOrders.length,
      completedOrders: completedTransactions,
      cancelledOrFailedOrders: failedOrders,
      averageOrderValue: paidOrders.length ? Math.round((totalSales / paidOrders.length + Number.EPSILON) * 100) / 100 : 0,
    },
    topSellingProducts: [...topProducts.values()].sort((left, right) => right.quantitySold - left.quantitySold).slice(0, 5),
    recentTransactions: await summarizeOrders(recentOrders, shopId),
    shop: shop ? { shopId: shop.shopId, name: shop.name } : { shopId, name: shopId },
  });
}

export async function listAdminTransactions(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  if (!shopId) {
    response.status(403).json({ error: 'This salesman account is not assigned to a shop.' });
    return;
  }
  const search = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 80) : '';
  const paymentStatus = typeof request.query.paymentStatus === 'string' ? request.query.paymentStatus : '';
  if (paymentStatus && !['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED'].includes(paymentStatus)) {
    response.status(400).json({ error: 'Unsupported payment status filter.' });
    return;
  }
  const filter: Record<string, unknown> = { shopId };
  if (search) filter.orderId = new RegExp(safePattern(search), 'i');
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  const limit = pageSize(request.query.limit);
  const [orders, total, shop] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).limit(limit),
    Order.countDocuments(filter),
    Shop.findOne({ shopId }).select('shopId name'),
  ]);
  response.json({
    transactions: await summarizeOrders(orders, shopId),
    total,
    limit,
    shop: shop ? { shopId: shop.shopId, name: shop.name } : { shopId, name: shopId },
  });
}

export async function listFlaggedTransactions(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  if (!shopId) {
    response.status(403).json({ error: 'This salesman account is not assigned to a shop.' });
    return;
  }
  const limit = pageSize(request.query.limit, 50);
  const paidOrders = await Order.find({ shopId, paymentStatus: 'SUCCESS' }).select('orderId').lean();
  const paidIds = paidOrders.map((order) => order.orderId);
  const [aiFlags, passFlags] = await Promise.all([
    AiVerification.find({ transactionId: { $in: paidIds }, status: 'CHECK_REQUIRED' }).select('transactionId').lean(),
    ExitPass.find({ shopId, orderId: { $in: paidIds }, status: 'CHECK_REQUIRED' }).select('orderId').lean(),
  ]);
  const flaggedIds = new Set<string>([
    ...aiFlags.map((result) => result.transactionId),
    ...passFlags.map((pass) => pass.orderId),
  ]);
  const orders = await Order.find({ shopId, orderId: { $in: [...flaggedIds] } }).sort({ paidAt: -1, createdAt: -1 }).limit(limit);
  const shop = await Shop.findOne({ shopId }).select('shopId name');
  response.json({
    transactions: await summarizeOrders(orders, shopId),
    total: flaggedIds.size,
    limit,
    shop: shop ? { shopId: shop.shopId, name: shop.name } : { shopId, name: shopId },
  });
}

export async function getAdminTransaction(request: Request, response: Response): Promise<void> {
  const shopId = shopIdFromRequest(request);
  const orderId = typeof request.params.orderId === 'string' ? request.params.orderId.trim() : '';
  if (!isValidPublicId(orderId)) {
    response.status(400).json({ error: 'Order ID is invalid.' });
    return;
  }
  const order = shopId ? await Order.findOne({ orderId, shopId }) : null;
  if (!order || !shopId) {
    response.status(404).json({ error: 'Transaction was not found in your shop.' });
    return;
  }
  const [shop, transaction] = await Promise.all([
    Shop.findOne({ shopId }).select('shopId name location'),
    summarizeOrders([order], shopId),
  ]);
  response.json({
    transaction: transaction[0],
    shop: shop ? { shopId: shop.shopId, name: shop.name, location: shop.location } : { shopId, name: shopId, location: '' },
  });
}
