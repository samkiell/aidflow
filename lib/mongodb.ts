import mongoose from 'mongoose';

type Cached = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  mongooseCache?: Cached;
};

const cache =
  globalWithMongoose.mongooseCache ?? { conn: null, promise: null };

globalWithMongoose.mongooseCache = cache;

/**
 * Reuse one connection across Next.js hot reloads and serverless invocations.
 * Failed connection attempts are cleared so a later request can retry.
 */
export async function connectMongo(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI must be configured before using the database.');
    }

    cache.promise = mongoose.connect(uri, { bufferCommands: false });
  }

  try {
    cache.conn = await cache.promise;
    return cache.conn;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
}
