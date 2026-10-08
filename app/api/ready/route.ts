import { NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await connectMongo();
    return NextResponse.json({ status: 'ready', service: 'aidflow' });
  } catch {
    return NextResponse.json(
      { status: 'not_ready', service: 'aidflow', dependency: 'mongodb' },
      { status: 503 },
    );
  }
}
