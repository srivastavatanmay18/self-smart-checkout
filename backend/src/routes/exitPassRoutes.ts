import { Router } from 'express';
import { approveExitPass, getCustomerExitPass, markExitPassCheckRequired, verifyExitPass } from '../controllers/exitPassController.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { guardScanRateLimiter } from '../middleware/rateLimit.js';

export const customerExitPassRouter = Router();
customerExitPassRouter.use(requireAuth, allowRoles('CUSTOMER'));
customerExitPassRouter.get('/orders/:orderId', getCustomerExitPass);

export const guardExitPassRouter = Router();
guardExitPassRouter.use(requireAuth, allowRoles('GUARD'), guardScanRateLimiter);
guardExitPassRouter.post('/verify', verifyExitPass);
guardExitPassRouter.post('/check-required', markExitPassCheckRequired);
guardExitPassRouter.post('/approve', approveExitPass);
