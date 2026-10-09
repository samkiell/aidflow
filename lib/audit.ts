import { AuditLogModel } from '@/models/AuditLog';

type AuditAction =
  | 'organization_submitted'
  | 'organization_verified'
  | 'organization_rejected'
  | 'campaign_created'
  | 'contribution_verified'
  | 'distribution_submitted'
  | 'distribution_approved'
  | 'distribution_rejected';

type AuditTarget = 'organization' | 'campaign' | 'contribution' | 'distribution';
type AuditActor = 'user' | 'campaign_admin_token' | 'review_token' | 'system';

export async function writeAuditLog(input: {
  actorType: AuditActor;
  actorId?: string;
  action: AuditAction;
  targetType: AuditTarget;
  targetId: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  await AuditLogModel.create({
    ...input,
    metadata: input.metadata ?? {},
  });
}
