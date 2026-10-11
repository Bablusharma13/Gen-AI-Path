import mongoose from 'mongoose';
import type { Logger } from '../lib/logger';

mongoose.set('strictQuery', true);

export async function connectMongo(
  uri: string,
  logger: Logger,
  options: { autoIndex: boolean; dbName?: string },
): Promise<typeof mongoose> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));

  await mongoose.connect(uri, {
    autoIndex: options.autoIndex,
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
    ...(options.dbName ? { dbName: options.dbName } : {}),
  });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return mongoose;
}

export async function pingMongo(): Promise<number | null> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) return null;
  const started = performance.now();
  try {
    await db.admin().command({ ping: 1 });
    return Math.round(performance.now() - started);
  } catch {
    return null;
  }
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
