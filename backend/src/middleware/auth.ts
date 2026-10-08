import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { User, type UserRole } from '../models/User.js';

export type AuthenticatedRequest = Request & {
  authUser?: { id: string; role: UserRole; shopId?: string };
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
  }
  return secret;
}

export function signAccessToken(user: { id: string; role: UserRole; tokenVersion?: number }): string {
  return jwt.sign({ role: user.role, version: user.tokenVersion ?? 0 }, getJwtSecret(), {
    subject: user.id,
    expiresIn: '12h',
    algorithm: 'HS256',
  });
}

export async function requireAuth(request: Request, response: Response, next: NextFunction): Promise<void> {
  const authRequest = request as AuthenticatedRequest;
  const authorization = request.header('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }

  let secret: string;
  try {
    secret = getJwtSecret();
  } catch {
    response.status(503).json({ error: 'Authentication is not configured. Set JWT_SECRET in backend/.env.' });
    return;
  }

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload;
  } catch {
    response.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  if (typeof payload.sub !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.sub)) {
    response.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  const user = await User.findById(payload.sub).select('_id role shopId +tokenVersion');
  if (!user || payload.version !== (user.tokenVersion ?? 0) || payload.role !== user.role) {
    response.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  authRequest.authUser = {
    id: String(user._id),
    role: user.role,
    ...(user.shopId ? { shopId: user.shopId } : {}),
  };
  next();
}

export function allowRoles(...roles: UserRole[]) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const authUser = (request as AuthenticatedRequest).authUser;
    if (!authUser) {
      response.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(authUser.role)) {
      response.status(403).json({ error: 'You do not have permission to access this resource.' });
      return;
    }
    next();
  };
}

export { getJwtSecret };
