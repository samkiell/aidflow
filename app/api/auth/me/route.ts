import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { connectMongo } from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    await connectMongo();
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    return NextResponse.json({ data: user });
  } catch {
    return NextResponse.json(
      { error: 'Session lookup is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
