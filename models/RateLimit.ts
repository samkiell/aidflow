import { model, models, Schema } from 'mongoose';

const rateLimitSchema = new Schema(
  {
    key: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

rateLimitSchema.index({ key: 1 }, { unique: true });
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export interface RateLimitBucket {
  key: string;
  count: number;
  expiresAt: Date;
}

export const RateLimitModel =
  models.RateLimit ?? model('RateLimit', rateLimitSchema);
