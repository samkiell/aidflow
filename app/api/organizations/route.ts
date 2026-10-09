import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectMongo } from '@/lib/mongodb';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';
import { OrganizationModel } from '@/models/Organization';
import { UserModel } from '@/models/User';
import { getAuthenticatedUser, hasTrustedOrigin } from '@/lib/auth';

export const runtime = 'nodejs';

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().min(30).max(3000),
  registrationNumber: z.string().trim().min(2).max(100).optional(),
  website: z.string().trim().url().max(500).optional(),
});

const reviewSchema = z.object({
  organizationId: z.string().regex(/^[a-f\d]{24}$/i),
  status: z.enum(['verified', 'rejected']),
  reviewNote: z.string().trim().max(1000).optional(),
});

function hasAdminToken(request: NextRequest, expected: string): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(supplied), digest(expected));
}

function unauthorizedOrUnconfigured(request: NextRequest): NextResponse | null {
  const token = process.env.AIDFLOW_REVIEW_TOKEN;
  if (!token || token.length < 32) {
    return NextResponse.json(
      { error: 'Organization review requires a server-side AIDFLOW_REVIEW_TOKEN of at least 32 characters.' },
      { status: 503 },
    );
  }
  if (!hasAdminToken(request, token)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return null;
}

/** Submit an organization for manual verification. The owner must be signed in. */
export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  let owner: Awaited<ReturnType<typeof getAuthenticatedUser>> = null;
  try {
    await connectMongo();
    owner = await getAuthenticatedUser(request);
    if (!owner) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    if (owner.role !== 'donor' || owner.organizationId) {
      return NextResponse.json(
        { error: 'This account cannot register another organization.' },
        { status: 409 },
      );
    }

    const allowed = await consumeRateLimit(
      'organization-registration',
      getRequestIdentity(request.headers),
      3,
      24 * 60 * 60_000,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many organization submissions. Try again later.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Organization registration is temporarily unavailable.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Organization validation failed.', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const organization = await OrganizationModel.create({
      ...parsed.data,
      ownerId: owner!.id,
      contactEmail: owner!.email,
      status: 'pending',
    });

    const updatedOwner = await UserModel.findByIdAndUpdate(
      owner!.id,
      {
        $set: {
          role: 'organization_owner',
          organizationId: organization._id,
        },
      },
      { new: true, runValidators: true },
    ).select('_id');

    if (!updatedOwner) {
      await OrganizationModel.deleteOne({ _id: organization._id });
      return NextResponse.json(
        { error: 'Organization ownership could not be saved.' },
        { status: 503 },
      );
    }

    return NextResponse.json({
      data: {
        id: organization.id,
        name: organization.name,
        status: organization.status,
        createdAt: organization.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    ) {
      return NextResponse.json(
        { error: 'An organization with this registration number already exists.' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'Organization could not be submitted.' },
      { status: 503 },
    );
  }
}

/** Admin-only queue of pending organization submissions. */
export async function GET(request: NextRequest) {
  const authError = unauthorizedOrUnconfigured(request);
  if (authError) return authError;

  try {
    await connectMongo();
    const data = await OrganizationModel.find({ status: 'pending' })
      .select('name contactEmail description registrationNumber website status createdAt')
      .sort({ createdAt: 1, _id: 1 })
      .limit(100)
      .lean();
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: 'Organization review queue is temporarily unavailable.' },
      { status: 503 },
    );
  }
}

/** Admin-only manual decision endpoint. Review notes remain private. */
export async function PATCH(request: NextRequest) {
  const authError = unauthorizedOrUnconfigured(request);
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

  try {
    await connectMongo();
    const organization = await OrganizationModel.findByIdAndUpdate(
      parsed.data.organizationId,
      {
        $set: {
          status: parsed.data.status,
          reviewNote: parsed.data.reviewNote,
          reviewedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    ).select('name status reviewedAt');

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found.' }, { status: 404 });
    }

    return NextResponse.json({ data: organization });
  } catch {
    return NextResponse.json(
      { error: 'Organization review could not be saved.' },
      { status: 503 },
    );
  }
}
