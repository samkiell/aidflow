import { model, models, Schema, type InferSchemaType } from 'mongoose';

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, expiresAt: 1 });

export type Session = InferSchemaType<typeof sessionSchema>;
export const SessionModel = models.Session ?? model('Session', sessionSchema);
