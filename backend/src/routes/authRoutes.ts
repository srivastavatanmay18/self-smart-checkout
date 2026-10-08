import { Router, type Request } from 'express';
import { currentUser, login, logout, registerCustomer } from '../controllers/authController.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { loginRateLimiter, registrationRateLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

authRouter.post('/register', registrationRateLimiter, registerCustomer);
authRouter.post('/login', loginRateLimiter, login);
authRouter.get('/me', requireAuth, currentUser);
authRouter.post('/logout', requireAuth, logout);

export const portalRouter = Router();
portalRouter.get('/customer', requireAuth, allowRoles('CUSTOMER'), (request, response) => {
  response.json({ portal: 'CUSTOMER', userId: (request as Request & { authUser?: { id: string } }).authUser?.id });
});
portalRouter.get('/guard', requireAuth, allowRoles('GUARD'), (request, response) => {
  response.json({ portal: 'GUARD', userId: (request as Request & { authUser?: { id: string } }).authUser?.id });
});
portalRouter.get('/admin', requireAuth, allowRoles('SALESMAN'), (request, response) => {
  response.json({ portal: 'SALESMAN', userId: (request as Request & { authUser?: { id: string } }).authUser?.id });
});
