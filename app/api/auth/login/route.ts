import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createUserSession, hasTrustedOrigin, setSessionCookie, verifyPassword } from '@/lib/auth';
import { connectMongo } from '@/lib/mongodb';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';
import { UserModel } from '@/models/User';

export const runtime = 'nodejs';

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  try {
    await connectMongo();
    const allowed = await consumeRateLimit(
      'auth-login',
      getRequestIdentity(request.headers),
      10,
      15 * 60_000,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': '900' } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Login is temporarily unavailable.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Login validation failed.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const user = await UserModel.findOne({
      email: parsed.data.email.toLowerCase(),
    }).select('+passwordHash');

    if (!user || user.status !== 'active' ||
        !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const session = await createUserSession(String(user._id));
    const response = NextResponse.json({
      data: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId ? String(user.organizationId) : null,
      },
    });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch {
    return NextResponse.json({ error: 'Login is temporarily unavailable.' }, { status: 503 });
  }
}
