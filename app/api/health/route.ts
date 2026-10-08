import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'aidflow', timestamp: new Date().toISOString() });
}
