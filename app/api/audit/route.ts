import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectMongo } from '@/lib/mongodb';
import { AuditLogModel } from '@/models/AuditLog';

export const runtime = 'nodejs';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  targetType: z.enum(['organization', 'campaign', 'contribution', 'distribution']).optional(),
  targetId: z.string().trim().min(1).max(200).optional(),
});

function hasReviewToken(request: NextRequest, expected: string): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

export async function GET(request: NextRequest) {
  const token = process.env.AIDFLOW_REVIEW_TOKEN;
  if (!token || token.length < 32) {
    return NextResponse.json(
      { error: 'Audit access requires a server-side AIDFLOW_REVIEW_TOKEN of at least 32 characters.' },
      { status: 503 },
    );
  }
  if (!hasReviewToken(request, token)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    page: request.nextUrl.searchParams.get('page') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
    targetType: request.nextUrl.searchParams.get('targetType') ?? undefined,
    targetId: request.nextUrl.searchParams.get('targetId') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Audit query validation failed.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await connectMongo();
    const filter: Record<string, unknown> = {};
    if (parsed.data.targetType) filter.targetType = parsed.data.targetType;
    if (parsed.data.targetId) filter.targetId = parsed.data.targetId;

    const skip = (parsed.data.page - 1) * parsed.data.limit;
    const [data, total] = await Promise.all([
      AuditLogModel.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(parsed.data.limit)
        .lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    return NextResponse.json({
      data,
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total,
        totalPages: Math.ceil(total / parsed.data.limit),
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Audit log is temporarily unavailable.' },
      { status: 503 },
    );
  }
}
