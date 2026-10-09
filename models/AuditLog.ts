import { model, models, Schema, type InferSchemaType } from 'mongoose';

const auditLogSchema = new Schema(
  {
    actorType: {
      type: String,
      enum: ['user', 'campaign_admin_token', 'review_token', 'system'],
      required: true,
      immutable: true,
    },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
    action: {
      type: String,
      enum: [
        'organization_submitted',
        'organization_verified',
        'organization_rejected',
        'campaign_created',
        'contribution_verified',
        'distribution_submitted',
        'distribution_approved',
        'distribution_rejected',
      ],
      required: true,
      immutable: true,
    },
    targetType: {
      type: String,
      enum: ['organization', 'campaign', 'contribution', 'distribution'],
      required: true,
      immutable: true,
    },
    targetId: { type: String, required: true, immutable: true },
    metadata: { type: Schema.Types.Mixed, default: {}, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = models.AuditLog ?? model('AuditLog', auditLogSchema);
