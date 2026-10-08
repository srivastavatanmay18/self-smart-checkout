import { Router } from 'express';
import { lookupProductByBarcode } from '../controllers/productController.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';

export const productRouter = Router();
productRouter.get('/barcode/:barcode', requireAuth, allowRoles('CUSTOMER'), lookupProductByBarcode);
