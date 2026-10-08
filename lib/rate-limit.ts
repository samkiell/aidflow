import { createHash } from 'node:crypto';
import { RateLimitModel } from '@/models/RateLimit';

let indexesReady: Promise<void> | undefined;

async function ensureIndexes(): Promise<void> {
  indexesReady ??= Promise.all([
    RateLimitModel.collection.createIndex({ key: 1 }, { unique: true }),
    RateLimitModel.collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
  ]).then(() => undefined);

  try {
    await indexesReady;
  } catch (error) {
    indexesReady = undefined;
    throw error;
  }
}

/**
 * Apply a fixed-window rate limit shared by all app instances using MongoDB.
 * Identity should come from a trusted deployment proxy header, never a body
 * field. The identity is hashed before persistence so raw IP addresses are
 * not stored in the rate-limit collection.
 */
export async function consumeRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (!scope || !identity || !Number.isInteger(limit) || limit < 1 ||
      !Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error('Invalid rate limit configuration.');
  }

  await ensureIndexes();

  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const key = createHash('sha256')
    .update(`${scope}:${identity}:${window}`)
    .digest('hex');
  const expiresAt = new Date((window + 2) * windowMs);

  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expiresAt },
  };

  try {
    const bucket = await RateLimitModel.findOneAndUpdate(
      { key },
      update,
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).select('count').lean();

    return Boolean(bucket && bucket.count <= limit);
  } catch (error) {
    // Concurrent first requests can race to create the unique bucket.
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      error.code !== 11000
    ) {
      throw error;
    }

    const bucket = await RateLimitModel.findOneAndUpdate(
      { key },
      { $inc: { count: 1 } },
      { new: true, upsert: false },
    ).select('count').lean();

    return Boolean(bucket && bucket.count <= limit);
  }
}

export function getRequestIdentity(headers: Headers): string {
  const trustedRealIp = headers.get('x-real-ip')?.trim();
  if (trustedRealIp) return trustedRealIp;

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstAddress = forwardedFor.split(',')[0]?.trim();
    if (firstAddress) return firstAddress;
  }

  return 'unknown';
}
