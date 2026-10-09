import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { SessionModel } from '@/models/Session';
import { UserModel } from '@/models/User';

export const SESSION_COOKIE_NAME = 'aidflow_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

let sessionIndexesReady: Promise<void> | undefined;

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: 'donor' | 'organization_owner';
  organizationId: string | null;
}

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const key = await deriveKey(password, salt);
  return `scrypt$${salt}$${key.toString('base64url')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [algorithm, salt, encodedKey, extra] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !encodedKey || extra !== undefined) {
    return false;
  }

  try {
    const expected = Buffer.from(encodedKey, 'base64url');
    const actual = await deriveKey(password, salt);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function createUserSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  sessionIndexesReady ??= Promise.all([
    SessionModel.collection.createIndex({ tokenHash: 1 }, { unique: true }),
    SessionModel.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]).then(() => undefined);

  try {
    await sessionIndexesReady;
  } catch (error) {
    sessionIndexesReady = undefined;
    throw error;
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await SessionModel.create({ userId, tokenHash, expiresAt });
  return { token, expiresAt };
}

export async function getAuthenticatedUser(
  request: NextRequest,
): Promise<AuthenticatedUser | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || token.length < 32) return null;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const session = await SessionModel.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
  }).select('userId');

  if (!session) return null;

  const user = await UserModel.findById(session.userId)
    .select('name email role status organizationId')
    .lean();

  if (!user || user.status !== 'active') return null;
  if (user.role !== 'donor' && user.role !== 'organization_owner') return null;

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId ? String(user.organizationId) : null,
  };
}

export async function revokeUserSession(request: NextRequest): Promise<void> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token || token.length < 32) return;

  const tokenHash = createHash('sha256').update(token).digest('hex');
  await SessionModel.deleteOne({ tokenHash });
}

export function hasTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === request.nextUrl.origin;
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}
