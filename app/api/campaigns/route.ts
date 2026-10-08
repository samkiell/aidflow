import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectMongo } from '@/lib/mongodb';
import { createCampaignSchema } from '@/lib/campaign-validation';
import { CampaignModel } from '@/models/Campaign';

export const runtime = 'nodejs';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function hasAdminToken(request: NextRequest, expected: string): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

/** Public campaign discovery. Drafts and paused campaigns are never exposed. */
export async function GET(request: NextRequest) {
  const parsedQuery = querySchema.safeParse({
    page: request.nextUrl.searchParams.get('page') ?? undefined,
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: 'Invalid pagination parameters.', issues: parsedQuery.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await connectMongo();
    const { page, limit } = parsedQuery.data;
    const filter = { status: 'published', endsAt: { $gt: new Date() } };
    const [campaigns, total] = await Promise.all([
      CampaignModel.find(filter)
        .select('title description organizationName goalAmount asset network status endsAt createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      CampaignModel.countDocuments(filter),
    ]);

    return NextResponse.json({
      data: campaigns,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch {
    return NextResponse.json(
      { error: 'Campaigns are temporarily unavailable.' },
      { status: 503 },
    );
  }
}

/**
 * Restricted bootstrap endpoint. This uses a server-side token until proper
 * user sessions and organization verification are implemented. Do not expose
 * the token to browser code or treat it as a replacement for production RBAC.
 */
export async function POST(request: NextRequest) {
  const adminToken = process.env.AIDFLOW_CAMPAIGN_ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json(
      { error: 'Campaign creation is not configured on this deployment.' },
      { status: 503 },
    );
  }

  if (!hasAdminToken(request, adminToken)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Campaign validation failed.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await connectMongo();
    const campaign = await CampaignModel.create(parsed.data);
    return NextResponse.json({ data: campaign }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Campaign could not be saved.' },
      { status: 503 },
    );
  }
}
