import { NextRequest, NextResponse } from 'next/server';
import { getAccountSummary } from '@/lib/stellar';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const publicKey = request.nextUrl.searchParams.get('publicKey');

  if (!publicKey || !/^G[A-Z2-7]{55}$/.test(publicKey)) {
    return NextResponse.json(
      { error: 'A valid Stellar publicKey is required.' },
      { status: 400 },
    );
  }

  try {
    const summary = await getAccountSummary(publicKey);
    return NextResponse.json(summary, {
      headers: { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=20' },
    });
  } catch {
    return NextResponse.json(
      { error: 'Unable to retrieve the Stellar account from the configured network.' },
      { status: 502 },
    );
  }
}
