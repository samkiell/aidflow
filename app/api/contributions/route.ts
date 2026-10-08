import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectMongo } from '@/lib/mongodb';
import { CampaignModel } from '@/models/Campaign';
import { ContributionModel } from '@/models/Contribution';
import { horizon, stellarNetwork } from '@/lib/stellar';

export const runtime = 'nodejs';

const TX_HASH_PATTERN = /^[a-f0-9]{64}$/i;

/** Public, privacy-conscious ledger for a single campaign. */
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
    }).select('_id');

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    }

    const [data, total] = await Promise.all([
      ContributionModel.find({ campaignId: campaign._id })
        .select('transactionHash amount asset network ledger verifiedAt')
        .sort({ verifiedAt: -1, _id: -1 })
        .limit(50)
        .lean(),
      ContributionModel.countDocuments({ campaignId: campaign._id }),
    ]);

    return NextResponse.json({ data, total, limit: 50 });
  } catch {
    return NextResponse.json({ error: 'Contribution ledger is temporarily unavailable.' }, { status: 503 });
  }
}

/**
 * Verify a completed one-operation Stellar payment before recording it.
 * The client cannot submit an amount, asset, sender, or verification status.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('campaignId' in body) ||
    !('transactionHash' in body) ||
    typeof body.campaignId !== 'string' ||
    typeof body.transactionHash !== 'string' ||
    !mongoose.isValidObjectId(body.campaignId) ||
    !TX_HASH_PATTERN.test(body.transactionHash)
  ) {
    return NextResponse.json(
      { error: 'campaignId and a 64-character Stellar transactionHash are required.' },
      { status: 400 },
    );
  }

  try {
    await connectMongo();
    const campaign = await CampaignModel.findOne({
      _id: body.campaignId,
      status: 'published',
      endsAt: { $gt: new Date() },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Active campaign not found.' }, { status: 404 });
    }

    if (campaign.network !== stellarNetwork) {
      return NextResponse.json(
        { error: 'Campaign network does not match the configured Stellar network.' },
        { status: 409 },
      );
    }

    let transaction;
    let operations;
    try {
      transaction = await horizon.transactions().transaction(body.transactionHash).call();
      if (!transaction.successful) {
        return NextResponse.json({ error: 'Stellar transaction was not successful.' }, { status: 422 });
      }
      if (transaction.operation_count !== 1) {
        return NextResponse.json(
          { error: 'Only single-operation payment transactions can be verified.' },
          { status: 422 },
        );
      }
      operations = await horizon.operations().forTransaction(body.transactionHash).limit(2).call();
    } catch {
      return NextResponse.json(
        { error: 'Transaction could not be verified on the configured Stellar network.' },
        { status: 502 },
      );
    }

    const operation = operations.records[0];
    if (!operation || operation.type !== 'payment') {
      return NextResponse.json({ error: 'Transaction is not a direct payment.' }, { status: 422 });
    }

    if (operation.to !== campaign.destinationPublicKey) {
      return NextResponse.json({ error: 'Payment destination does not match this campaign.' }, { status: 422 });
    }

    const assetMatches =
      campaign.asset === 'native'
        ? operation.asset_type === 'native'
        : operation.asset_type !== 'native' &&
          operation.asset_code === campaign.asset &&
          operation.asset_issuer === campaign.assetIssuer;

    if (!assetMatches) {
      return NextResponse.json({ error: 'Payment asset does not match this campaign.' }, { status: 422 });
    }

    if (!Number.isFinite(Number(operation.amount)) || Number(operation.amount) <= 0) {
      return NextResponse.json({ error: 'Payment amount is invalid.' }, { status: 422 });
    }

    const contribution = await ContributionModel.create({
      campaignId: campaign._id,
      transactionHash: transaction.hash,
      donorPublicKey: transaction.source_account,
      amount: operation.amount,
      asset: campaign.asset,
      network: campaign.network,
      ledger: transaction.ledger_attr,
    });

    return NextResponse.json({
      data: {
        id: contribution.id,
        transactionHash: contribution.transactionHash,
        amount: contribution.amount,
        asset: contribution.asset,
        network: contribution.network,
        ledger: contribution.ledger,
        verifiedAt: contribution.verifiedAt,
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
        { error: 'This transaction has already been recorded.' },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: 'Contribution could not be recorded.' }, { status: 503 });
  }
}
