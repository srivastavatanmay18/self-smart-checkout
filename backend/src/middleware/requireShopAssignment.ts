import type { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from './auth.js';

export function requireShopAssignment(request: Request, response: Response, next: NextFunction): void {
  const authUser = (request as AuthenticatedRequest).authUser;
  if (!authUser?.shopId) {
    response.status(403).json({ error: 'This salesman account is not assigned to a shop.' });
    return;
  }
  next();
}
