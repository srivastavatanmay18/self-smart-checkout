import { Router } from 'express';
import { getPermanentShopQr, identifyShop } from '../controllers/shopController.js';
import { addCartItem, getCurrentCart, removeCartItem, setCartItemQuantity } from '../controllers/cartController.js';
import { getCurrentShoppingSession, startShoppingSession } from '../controllers/shoppingSessionController.js';
import { createCheckout, getOrderPaymentStatus, simulateOrderPayment } from '../controllers/checkoutController.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { paymentRateLimiter } from '../middleware/rateLimit.js';

export const shopRouter = Router();
shopRouter.post('/identify', requireAuth, allowRoles('CUSTOMER'), identifyShop);
shopRouter.get('/:shopId/qr', requireAuth, allowRoles('SALESMAN'), getPermanentShopQr);

export const shoppingSessionRouter = Router();
shoppingSessionRouter.use(requireAuth, allowRoles('CUSTOMER'));
shoppingSessionRouter.get('/current', getCurrentShoppingSession);
shoppingSessionRouter.get('/current/cart', getCurrentCart);
shoppingSessionRouter.post('/current/checkout', createCheckout);
shoppingSessionRouter.post('/current/cart/items', addCartItem);
shoppingSessionRouter.patch('/current/cart/items/:productId', setCartItemQuantity);
shoppingSessionRouter.delete('/current/cart/items/:productId', removeCartItem);
shoppingSessionRouter.post('/', startShoppingSession);

export const orderRouter = Router();
orderRouter.use(requireAuth, allowRoles('CUSTOMER'), paymentRateLimiter);
orderRouter.get('/:orderId/payment', getOrderPaymentStatus);
orderRouter.post('/:orderId/payment', simulateOrderPayment);
