import { Router } from 'express';
import {
  getAdminDashboard,
  getAdminTransaction,
  getSalesAnalytics,
  listAdminTransactions,
  listFlaggedTransactions,
} from '../controllers/adminAnalyticsController.js';
import {
  createAdminProduct,
  deactivateAdminProduct,
  getAdminProduct,
  listAdminProducts,
  updateAdminProduct,
} from '../controllers/adminProductController.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { requireShopAssignment } from '../middleware/requireShopAssignment.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, allowRoles('SALESMAN'), requireShopAssignment);

adminRouter.get('/dashboard', getAdminDashboard);
adminRouter.get('/products', listAdminProducts);
adminRouter.post('/products', createAdminProduct);
adminRouter.get('/products/:productId', getAdminProduct);
adminRouter.patch('/products/:productId', updateAdminProduct);
adminRouter.delete('/products/:productId', deactivateAdminProduct);
adminRouter.get('/sales', getSalesAnalytics);
adminRouter.get('/transactions/flagged', listFlaggedTransactions);
adminRouter.get('/transactions', listAdminTransactions);
adminRouter.get('/transactions/:orderId', getAdminTransaction);
