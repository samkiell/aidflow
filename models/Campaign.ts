import { model, models, Schema, type InferSchemaType } from 'mongoose';

const campaignSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    organizationName: { type: String, required: true, trim: true, maxlength: 160 },
    goalAmount: { type: String, required: true },
    destinationPublicKey: { type: String, required: true, match: /^G[A-Z2-7]{55}$/ },
    asset: { type: String, required: true, default: 'native' },
    assetIssuer: { type: String, match: /^G[A-Z2-7]{55}$/ },
    network: { type: String, enum: ['testnet', 'public'], required: true, default: 'testnet' },
    status: { type: String, enum: ['draft', 'published', 'paused', 'completed'], required: true, default: 'draft' },
    endsAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

campaignSchema.index({ status: 1, createdAt: -1 });
campaignSchema.index({ organizationId: 1, status: 1 });
campaignSchema.index({ endsAt: 1, status: 1 });

export type Campaign = InferSchemaType<typeof campaignSchema>;
export const CampaignModel =
  models.Campaign ?? model('Campaign', campaignSchema);
