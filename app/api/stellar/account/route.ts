import { NextRequest, NextResponse } from 'next/server';
import { getAccountSummary } from '@/lib/stellar';
export async function GET(request: NextRequest) {
  const publicKey = request.nextUrl.searchParams.get('publicKey');
  if (!publicKey) return NextResponse.json({ error: 'publicKey query parameter is required.' }, { status: 400 });
  try { return NextResponse.json(await getAccountSummary(publicKey)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load Stellar account.' }, { status: 400 }); }
}
