import { createHash, timingSafeEqual } from 'node:crypto';
import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/audit';
import { decimalToUnits } from '@/lib/amount';
import { getAuthenticatedUser, hasTrustedOrigin } from '@/lib/auth';
import { connectMongo } from '@/lib/mongodb';
import { CampaignModel } from '@/models/Campaign';
import { ContributionModel } from '@/models/Contribution';
import { DistributionModel } from '@/models/Distribution';
import { OrganizationModel } from '@/models/Organization';

export const runtime = 'nodejs';

const amountSchema = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,7})?$/, 'Amount must have up to 8 integer digits and 7 decimal places.')
  .refine((value) => {
    try {
      return decimalToUnits(value) > 0n;
    } catch {
      return false;
    }
  }, 'Amount must be a positive decimal within the supported range.');

const submissionSchema = z.object({
  campaignId: z.string().regex(/^[a-f\d]{24}$/i),
  amount: amountSchema,
  category: z.enum(['food', 'medical', 'shelter', 'education', 'cash', 'other']),
  publicSummary: z.string().trim().min(20).max(500),
  evidenceReference: z
    .string()
    .trim()
    .min(5)
    .max(300)
    .regex(/^[A-Za-z0-9._:/-]+$/)
    .refine((value) => !/^https?:\/\//i.test(value), 'Use a private evidence reference, not a public URL.'),
  distributedAt: z.string().datetime(),
});

const reviewSchema = z.object({
  distributionId: z.string().regex(/^[a-f\d]{24}$/i),
  status: z.enum(['approved', 'rejected']),
  reviewNote: z.string().trim().max(1000).optional(),
});

function hasReviewToken(request: NextRequest, expected: string): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

function reviewAuthorizationError(request: NextRequest): NextResponse | null {
  const token = process.env.AIDFLOW_REVIEW_TOKEN;
  if (!token || token.length < 32) {
    return NextResponse.json(
      { error: 'Distribution review requires a server-side AIDFLOW_REVIEW_TOKEN of at least 32 characters.' },
      { status: 503 },
    );
  }
  if (!hasReviewToken(request, token)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return null;
}

async function sumAmountUnits(
  model: typeof ContributionModel | typeof DistributionModel,
  filter: Record<string, unknown>,
): Promise<bigint> {
  const rows = await model.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalUnits: {
          $sum: {
            $toLong: {
              $multiply: [
                { $toDecimal: '$amount' },
                { $toDecimal: '10000000' },
              ],
            },
          },
        },
      },
    },
  ]);
  return BigInt(String(rows[0]?.totalUnits ?? 0));
}

/** Public summaries expose no evidence references, reviewer notes, or owner IDs. */
export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get('campaignId');
  if (!campaignId || !mongoose.isValidObjectId(campaignId)) {
    return NextResponse.json({ error: 'A valid campaignId is required.' }, { status: 400 });
  }

  try {
    await connectMongo();
    const campaign = await CampaignModel.findOne({
      _id: campaignId,
      status: 'published',
    }).select('_id organizationId');

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const organization = await OrganizationModel.findOne({
      _id: campaign.organizationId,
      status: 'verified',
    }).select('_id');

    if (!organization) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const data = await DistributionModel.find({
      campaignId: campaign._id,
      status: 'approved',
    })
      .select('amount category publicSummary distributedAt status')
      .sort({ distributedAt: -1, _id: -1 })
      .limit(100)
      .lean();

    return NextResponse.json({ data, limit: 100 });
  } catch {
    return NextResponse.json(
      { error: 'Distribution records are temporarily unavailable.' },
      { status: 503 },
    );
  }
}

/** Verified organization owners can submit distribution records for review. */
export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Distribution validation failed.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await connectMongo();
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    if (user.role !== 'organization_owner' || !user.organizationId) {
      return NextResponse.json({ error: 'A verified organization owner is required.' }, { status: 403 });
    }

    const organization = await OrganizationModel.findOne({
      _id: user.organizationId,
      status: 'verified',
    }).select('_id');
    if (!organization) {
      return NextResponse.json({ error: 'Organization is not verified.' }, { status: 403 });
    }

    const campaign = await CampaignModel.findOne({
      _id: parsed.data.campaignId,
      organizationId: organization._id,
      status: 'published',
    }).select('_id goalAmount');

    if (!campaign) {
      return NextResponse.json({ error: 'Published campaign not found for this organization.' }, { status: 404 });
    }

    const amountUnits = decimalToUnits(parsed.data.amount);
    const goalUnits = decimalToUnits(campaign.goalAmount);
    const contributionUnits = await sumAmountUnits(ContributionModel, {
      campaignId: campaign._id,
    });
    const approvedUnits = await sumAmountUnits(DistributionModel, {
      campaignId: campaign._id,
      status: 'approved',
    });
    const availableUnits = (contributionUnits < goalUnits ? contributionUnits : goalUnits) - approvedUnits;

    if (amountUnits > availableUnits) {
      return NextResponse.json(
        { error: 'Distribution amount exceeds the campaign’s available verified contributions.' },
        { status: 409 },
      );
    }

    const distribution = await DistributionModel.create({
      campaignId: campaign._id,
      createdBy: user.id,
      amount: parsed.data.amount,
      category: parsed.data.category,
      publicSummary: parsed.data.publicSummary,
      evidenceReference: parsed.data.evidenceReference,
      distributedAt: new Date(parsed.data.distributedAt),
      status: 'pending',
    });

    try {
      await writeAuditLog({
        actorType: 'user',
        actorId: user.id,
        action: 'distribution_submitted',
        targetType: 'distribution',
        targetId: String(distribution._id),
        metadata: {
          campaignId: String(campaign._id),
          amount: parsed.data.amount,
          category: parsed.data.category,
        },
      });
    } catch {
      await DistributionModel.deleteOne({ _id: distribution._id });
      return NextResponse.json(
        { error: 'Audit record could not be saved; distribution was not submitted.' },
        { status: 503 },
      );
    }

    return NextResponse.json({
      data: {
        id: String(distribution._id),
        amount: distribution.amount,
        category: distribution.category,
        status: distribution.status,
        distributedAt: distribution.distributedAt,
      },
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Distribution could not be submitted.' },
      { status: 503 },
    );
  }
}

/** Reviewers approve or reject pending records using a separate server secret. */
export async function PATCH(request: NextRequest) {
  const authError = reviewAuthorizationError(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Review validation failed.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let reservedUnits = 0;
  let campaignId: mongoose.Types.ObjectId | null = null;
  let distributionId: mongoose.Types.ObjectId | null = null;

  try {
    await connectMongo();
    const distribution = await DistributionModel.findOne({
      _id: parsed.data.distributionId,
      status: 'pending',
    }).select('campaignId amount status');

    if (!distribution) {
      return NextResponse.json(
        { error: 'Pending distribution not found.' },
        { status: 404 },
      );
    }

    distributionId = distribution._id;
    campaignId = distribution.campaignId;

    if (parsed.data.status === 'approved') {
      const campaign = await CampaignModel.findById(distribution.campaignId)
        .select('goalAmount totalDistributedUnits');
      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
      }

      const amountUnits = decimalToUnits(distribution.amount);
      const goalUnits = decimalToUnits(campaign.goalAmount);
      const contributionUnits = await sumAmountUnits(ContributionModel, {
        campaignId: distribution.campaignId,
      });
      const approvedUnits = await sumAmountUnits(DistributionModel, {
        campaignId: distribution.campaignId,
        status: 'approved',
      });
      const availableUnits = (contributionUnits < goalUnits ? contributionUnits : goalUnits) - approvedUnits;

      if (amountUnits > availableUnits) {
        return NextResponse.json(
          { error: 'Approval would exceed the campaign’s available verified contributions.' },
          { status: 409 },
        );
      }

      await CampaignModel.updateOne(
        { _id: campaign._id, totalDistributedUnits: { $exists: false } },
        { $set: { totalDistributedUnits: Number(approvedUnits) } },
      );

      const reserved = await CampaignModel.findOneAndUpdate(
        {
          _id: campaign._id,
          totalDistributedUnits: { $lte: Number(availableUnits - amountUnits) },
        },
        { $inc: { totalDistributedUnits: Number(amountUnits) } },
        { new: true },
      ).select('_id');

      if (!reserved) {
        return NextResponse.json(
          { error: 'Another distribution changed the available balance. Retry the review.' },
          { status: 409 },
        );
      }
      reservedUnits = Number(amountUnits);
    }

    const updated = await DistributionModel.findOneAndUpdate(
      { _id: distribution._id, status: 'pending' },
      {
        $set: {
          status: parsed.data.status,
          reviewNote: parsed.data.reviewNote,
          reviewedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    ).select('campaignId amount category publicSummary distributedAt status reviewedAt');

    if (!updated) {
      if (reservedUnits > 0 && campaignId) {
        await CampaignModel.updateOne({ _id: campaignId }, { $inc: { totalDistributedUnits: -reservedUnits } });
      }
      return NextResponse.json(
        { error: 'Distribution review state changed. Retry the review.' },
        { status: 409 },
      );
    }

    try {
      await writeAuditLog({
        actorType: 'review_token',
        action: parsed.data.status === 'approved' ? 'distribution_approved' : 'distribution_rejected',
        targetType: 'distribution',
        targetId: String(updated._id),
        metadata: {
          campaignId: String(updated.campaignId),
          amount: updated.amount,
          status: updated.status,
        },
      });
    } catch {
      await DistributionModel.updateOne(
        { _id: updated._id, status: parsed.data.status },
        { $set: { status: 'pending', reviewedAt: null, reviewNote: null } },
      );
      if (reservedUnits > 0 && campaignId) {
        await CampaignModel.updateOne({ _id: campaignId }, { $inc: { totalDistributedUnits: -reservedUnits } });
      }
      return NextResponse.json(
        { error: 'Audit record could not be saved; the review was rolled back.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ data: updated });
  } catch {
    if (reservedUnits > 0 && campaignId) {
      await CampaignModel.updateOne({ _id: campaignId }, { $inc: { totalDistributedUnits: -reservedUnits } });
    }
    if (distributionId) {
      await DistributionModel.updateOne(
        { _id: distributionId, status: parsed.data.status },
        { $set: { status: 'pending', reviewedAt: null, reviewNote: null } },
      );
    }
    return NextResponse.json(
      { error: 'Distribution review could not be saved.' },
      { status: 503 },
    );
  }
}
