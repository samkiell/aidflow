import { model, models, Schema, type InferSchemaType } from 'mongoose';

const contributionSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true, index: true },
    transactionHash: { type: String, required: true, unique: true, immutable: true },
    donorPublicKey: { type: String, required: true, match: /^G[A-Z2-7]{55}$/ },
    amount: { type: String, required: true },
    asset: { type: String, required: true },
    network: { type: String, enum: ['testnet', 'public'], required: true },
    ledger: { type: Number, required: true },
    verifiedAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { timestamps: true, versionKey: false },
);

contributionSchema.index({ campaignId: 1, verifiedAt: -1 });

export type Contribution = InferSchemaType<typeof contributionSchema>;
export const ContributionModel =
  models.Contribution ?? model('Contribution', contributionSchema);
