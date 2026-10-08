import mongoose from 'mongoose';

export async function connectDatabase(uri: string | undefined): Promise<void> {
  if (!uri) {
    console.warn('MONGODB_URI is not configured; starting API without a database connection.');
    return;
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');
}

export function databaseStatus(): 'connected' | 'disconnected' | 'connecting' {
  if (mongoose.connection.readyState === 1) return 'connected';
  if (mongoose.connection.readyState === 2) return 'connecting';
  return 'disconnected';
}
