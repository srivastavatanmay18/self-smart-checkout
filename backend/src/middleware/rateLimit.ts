import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetsAt: number };

/** Small per-process fixed-window limiter for sensitive prototype endpoints. */
export function createRateLimiter(options: { windowMs: number; maxRequests: number; message?: string }) {
  const buckets = new Map<string, Bucket>();
  const message = options.message ?? 'Too many requests. Please try again shortly.';

  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetsAt <= now) {
      bucket = { count: 0, resetsAt: now + options.windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= options.maxRequests) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetsAt - now) / 1000))));
      response.status(429).json({ error: message });
      return;
    }

    bucket.count += 1;
    response.setHeader('RateLimit-Limit', String(options.maxRequests));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, options.maxRequests - bucket.count)));
    response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetsAt / 1000)));

    if (buckets.size > 1000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetsAt <= now) buckets.delete(bucketKey);
      }
    }
    next();
  };
}

export const loginRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 20, message: 'Too many login attempts. Try again later.' });
export const registrationRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: 10, message: 'Too many registration attempts. Try again later.' });
export const paymentRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 20, message: 'Too many payment attempts. Wait before retrying.' });
export const guardScanRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120, message: 'Too many QR verification requests. Wait before scanning again.' });
