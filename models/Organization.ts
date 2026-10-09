import { model, models, Schema, type InferSchemaType } from 'mongoose';

const organizationSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, required: true, trim: true, maxlength: 3000 },
    registrationNumber: { type: String, trim: true, maxlength: 100 },
    website: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      required: true,
      default: 'pending',
    },
    reviewNote: { type: String, maxlength: 1000 },
    reviewedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

organizationSchema.index({ status: 1, createdAt: 1 });
organizationSchema.index({ ownerId: 1 }, { unique: true, sparse: true });
organizationSchema.index(
  { registrationNumber: 1 },
  { unique: true, sparse: true },
);

export type Organization = InferSchemaType<typeof organizationSchema>;
export const OrganizationModel =
  models.Organization ?? model('Organization', organizationSchema);
