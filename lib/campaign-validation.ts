import { z } from 'zod';

const positiveAmount = z
  .string()
  .regex(/^\d+(\.\d{1,7})?$/, 'Amount must be a decimal with up to 7 places.')
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
    message: 'Amount must be greater than zero.',
  });

export const createCampaignSchema = z
  .object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(30).max(5000),
    organizationName: z.string().trim().min(2).max(160),
    goalAmount: positiveAmount,
    destinationPublicKey: z.string().regex(/^G[A-Z2-7]{55}$/, 'A valid Stellar public key is required.'),
    asset: z.string().trim().min(1).max(12).default('native'),
    assetIssuer: z.string().regex(/^G[A-Z2-7]{55}$/).optional(),
    network: z.enum(['testnet', 'public']).default('testnet'),
    endsAt: z.string().datetime().refine((value) => new Date(value).getTime() > Date.now(), {
      message: 'Campaign end date must be in the future.',
    }),
    status: z.enum(['draft', 'published']).default('draft'),
  })
  .superRefine((value, context) => {
    if (value.asset !== 'native' && !value.assetIssuer) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assetIssuer'],
        message: 'An asset issuer is required for non-native Stellar assets.',
      });
    }
  });

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
