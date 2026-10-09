import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectMongo } from '@/lib/mongodb';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';
import { createCampaignSchema } from '@/lib/campaign-validation';
import { CampaignModel } from '@/models/Campaign';
import { OrganizationModel } from '@/models/Organization';
import { getAuthenticatedUser, hasTrustedOrigin } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

export const runtime = 'nodejs';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
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
    const allowed = await consumeRateLimit(
      'campaign-discovery',
      getRequestIdentity(request.headers),
      60,
      60_000,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many campaign requests. Try again shortly.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const { page, limit } = parsedQuery.data;
    const verifiedOrganizationIds = await OrganizationModel.find({ status: 'verified' }).distinct('_id');
    const filter = {
      status: 'published',
      endsAt: { $gt: new Date() },
      organizationId: { $in: verifiedOrganizationIds },
    };
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
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const adminToken = process.env.AIDFLOW_CAMPAIGN_ADMIN_TOKEN;
  const isAdmin =
    Boolean(adminToken) &&
    adminToken!.length >= 32 &&
    hasAdminToken(request, adminToken!);
  let owner: Awaited<ReturnType<typeof getAuthenticatedUser>> = null;

  if (!isAdmin) {
    try {
      await connectMongo();
      owner = await getAuthenticatedUser(request);
    } catch {
      return NextResponse.json(
        { error: 'Authentication is temporarily unavailable.' },
        { status: 503 },
      );
    }

    if (!owner) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    if (owner.role !== 'organization_owner' || !owner.organizationId) {
      return NextResponse.json(
        { error: 'Only verified organization owners can create campaigns.' },
        { status: 403 },
      );
    }
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
    const allowed = await consumeRateLimit(
      'campaign-creation',
      getRequestIdentity(request.headers),
      10,
      60 * 60_000,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many campaign creation attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    if (owner && owner.organizationId !== parsed.data.organizationId) {
      return NextResponse.json(
        { error: 'You can only create campaigns for your own organization.' },
        { status: 403 },
      );
    }

    const organization = await OrganizationModel.findOne({
      _id: parsed.data.organizationId,
      status: 'verified',
    }).select('name');

    if (!organization) {
      return NextResponse.json(
        { error: 'Campaigns can only be created for verified organizations.' },
        { status: 409 },
      );
    }

    const campaign = await CampaignModel.create({
      ...parsed.data,
      organizationId: organization._id,
      organizationName: organization.name,
    });

    try {
      await writeAuditLog({
        actorType: isAdmin ? 'campaign_admin_token' : 'user',
        actorId: owner?.id,
        action: 'campaign_created',
        targetType: 'campaign',
        targetId: String(campaign._id),
        metadata: {
          organizationId: String(organization._id),
          status: campaign.status,
          network: campaign.network,
        },
      });
    } catch {
      await CampaignModel.deleteOne({ _id: campaign._id });
      return NextResponse.json(
        { error: 'Audit record could not be saved; campaign was not created.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ data: campaign }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Campaign could not be saved.' },
      { status: 503 },
    );
  }
}
