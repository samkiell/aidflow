import { model, models, Schema, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['donor', 'organization_owner'],
      required: true,
      default: 'donor',
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      required: true,
      default: 'active',
    },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization' },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ organizationId: 1, role: 1 });

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = models.User ?? model('User', userSchema);
