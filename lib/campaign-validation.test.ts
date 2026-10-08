import { describe, expect, it } from 'vitest';
import { createCampaignSchema } from './campaign-validation';

const validCampaign = () => ({
  title: 'Clean water for rural communities',
  description: 'Fund reliable clean water access for a community and publish reviewed distribution outcomes.',
  organizationName: 'Community Aid Network',
  goalAmount: '1250.5000000',
  destinationPublicKey: 'G' + 'A'.repeat(55),
  endsAt: new Date(Date.now() + 86_400_000).toISOString(),
});

describe('createCampaignSchema', () => {
  it('applies safe defaults for a native-asset draft', () => {
    const parsed = createCampaignSchema.parse(validCampaign());
    expect(parsed.asset).toBe('native');
    expect(parsed.network).toBe('testnet');
    expect(parsed.status).toBe('draft');
  });

  it('rejects non-positive or malformed contribution goals', () => {
    expect(createCampaignSchema.safeParse({ ...validCampaign(), goalAmount: '0' }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...validCampaign(), goalAmount: '1.12345678' }).success).toBe(false);
  });

  it('requires an issuer for non-native assets', () => {
    const parsed = createCampaignSchema.safeParse({ ...validCampaign(), asset: 'USDC' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.assetIssuer).toBeDefined();
    }
  });

  it('rejects malformed destination addresses and expired campaigns', () => {
    expect(createCampaignSchema.safeParse({ ...validCampaign(), destinationPublicKey: 'not-a-key' }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...validCampaign(), endsAt: new Date(Date.now() - 1000).toISOString() }).success).toBe(false);
  });
});
