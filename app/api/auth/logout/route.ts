import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookie,
  hasTrustedOrigin,
  revokeUserSession,
} from '@/lib/auth';
import { connectMongo } from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const response = NextResponse.json({ data: { loggedOut: true } });
  clearSessionCookie(response);

  try {
    await connectMongo();
    await revokeUserSession(request);
  } catch {
    // The browser cookie is cleared even if session revocation cannot be reached.
  }

  return response;
}
