import { model, models, Schema, type InferSchemaType } from 'mongoose';

const distributionSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: String, required: true },
    category: {
      type: String,
      enum: ['food', 'medical', 'shelter', 'education', 'cash', 'other'],
      required: true,
    },
    publicSummary: { type: String, required: true, trim: true, maxlength: 500 },
    evidenceReference: { type: String, required: true, maxlength: 300, select: false },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      required: true,
      default: 'pending',
    },
    distributedAt: { type: Date, required: true },
    reviewNote: { type: String, maxlength: 1000, select: false },
    reviewedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

distributionSchema.index({ campaignId: 1, status: 1, distributedAt: -1 });
distributionSchema.index({ createdBy: 1, createdAt: -1 });

export type Distribution = InferSchemaType<typeof distributionSchema>;
export const DistributionModel =
  models.Distribution ?? model('Distribution', distributionSchema);
