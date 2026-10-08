import 'dotenv/config';
import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { validateRuntimeConfiguration } from './config/environment.js';

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be a whole number between 1 and 65535.');
}

async function start(): Promise<void> {
  validateRuntimeConfiguration();
  try {
    await connectDatabase(process.env.MONGODB_URI);
  } catch (error) {
    console.error('MongoDB connection failed:', safeErrorName(error));
    if (process.env.NODE_ENV === 'production') throw error;
    console.warn('Starting API in disconnected mode; health endpoint remains available.');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Self Smart Checkout API listening on http://localhost:${port}`);
  });
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

void start().catch((error: unknown) => {
  console.error('API startup failed:', safeErrorName(error));
  process.exitCode = 1;
});
