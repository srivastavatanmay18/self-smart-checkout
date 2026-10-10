import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { databaseStatus } from './config/database.js';
import { authRouter, portalRouter } from './routes/authRoutes.js';
import { productRouter } from './routes/productRoutes.js';
import { orderRouter, shopRouter, shoppingSessionRouter } from './routes/shopRoutes.js';
import { customerExitPassRouter, guardExitPassRouter } from './routes/exitPassRoutes.js';
import { adminRouter } from './routes/adminRoutes.js';

export const app = express();

const developmentOrigins = 'http://localhost:8081,http://127.0.0.1:8081';
const allowedOrigins = new Set((process.env.CORS_ORIGINS ?? (process.env.NODE_ENV === 'production' ? '' : developmentOrigins))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
}));
app.use(express.json({ limit: '32kb' }));

app.use('/api/auth', authRouter);
app.use('/api/portals', portalRouter);
app.use('/api/shops', shopRouter);
app.use('/api/sessions', shoppingSessionRouter);
app.use('/api/orders', orderRouter);
app.use('/api/customer/exit-passes', customerExitPassRouter);
app.use('/api/guard/exit-passes', guardExitPassRouter);
app.use('/api/products', productRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'self-smart-checkout-api',
    database: databaseStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health/ready', (_request, response) => {
  const database = databaseStatus();
  const ready = database === 'connected';
  response.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    service: 'self-smart-checkout-api',
    database,
    timestamp: new Date().toISOString(),
  });
});

app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found' });
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (isHttpError(error, 'entity.parse.failed')) {
    response.status(400).json({ error: 'Request body must contain valid JSON.' });
    return;
  }
  if (isHttpError(error, 'entity.too.large')) {
    response.status(413).json({ error: 'Request body is too large.' });
    return;
  }
  if (hasErrorName(error, 'ValidationError') || hasErrorName(error, 'CastError')) {
    response.status(400).json({ error: 'Request data is invalid.' });
    return;
  }
  if (isDuplicateKeyError(error)) {
    response.status(409).json({ error: 'A record with these unique fields already exists.' });
    return;
  }
  console.error('Unhandled API error:', error instanceof Error ? error.name : 'UnknownError');
  response.status(500).json({ error: 'An unexpected server error occurred.' });
});

function hasErrorName(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name;
}

function isHttpError(error: unknown, type: string): boolean {
  return typeof error === 'object' && error !== null && 'type' in error && error.type === type;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}
