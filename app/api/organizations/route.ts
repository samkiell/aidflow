import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectMongo } from '@/lib/mongodb';
import { consumeRateLimit, getRequestIdentity } from '@/lib/rate-limit';
import { OrganizationModel } from '@/models/Organization';

export const runtime = 'nodejs';

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  contactEmail: z.string().trim().email().max(254),
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
  const token = process.env.AIDFLOW_CAMPAIGN_ADMIN_TOKEN;
  if (!token || token.length < 32) {
    return NextResponse.json(
      { error: 'Organization review requires a server-side admin token of at least 32 characters.' },
      { status: 503 },
    );
  }
  if (!hasAdminToken(request, token)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  return null;
}

/** Submit an organization for manual verification. New records are never trusted by default. */
export async function POST(request: NextRequest) {
  try {
    await connectMongo();
    const allowed = await consumeRateLimit(
      'organization-registration',
      getRequestIdentity(request.headers),
      5,
      60 * 60_000,
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
      status: 'pending',
    });
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
