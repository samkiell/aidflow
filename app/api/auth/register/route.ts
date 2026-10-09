import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createUserSession, hashPassword, setSessionCookie, hasTrustedOrigin } from '@/lib/auth';
import { connectMongo } from '@/lib/mongodb';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';
import { UserModel } from '@/models/User';

export const runtime = 'nodejs';

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  try {
    await connectMongo();
    await UserModel.collection.createIndex({ email: 1 }, { unique: true });
    const allowed = await consumeRateLimit(
      'auth-register',
      getRequestIdentity(request.headers),
      5,
      60 * 60_000,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Registration is temporarily unavailable.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Registration validation failed.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  try {
    const user = await UserModel.create({
      name: parsed.data.name,
      email,
      passwordHash: await hashPassword(parsed.data.password),
      role: 'donor',
      status: 'active',
    });
    const session = await createUserSession(String(user._id));
    const response = NextResponse.json(
      {
        data: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 },
    );
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Registration could not be completed.' },
      { status: 503 },
    );
  }
}
