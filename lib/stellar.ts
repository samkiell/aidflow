import { Horizon, Networks } from '@stellar/stellar-sdk';

export const stellarNetwork =
  process.env.STELLAR_NETWORK === 'public' ? 'public' : 'testnet';

export const stellarPassphrase =
  stellarNetwork === 'public' ? Networks.PUBLIC : Networks.TESTNET;

const defaultHorizonUrl =
  stellarNetwork === 'public'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';

export const horizon = new Horizon.Server(
  process.env.STELLAR_HORIZON_URL || defaultHorizonUrl,
);

/** Fetches public account information only; this helper never signs transactions. */
export async function getAccountSummary(publicKey: string) {
  if (!/^G[A-Z2-7]{55}$/.test(publicKey)) {
    throw new Error('Invalid Stellar public key.');
  }

  const account = await horizon.loadAccount(publicKey);

  const balances = account.balances.map((balance) => {
    if (
      balance.asset_type === 'credit_alphanum4' ||
      balance.asset_type === 'credit_alphanum12'
    ) {
      return {
        asset_type: balance.asset_type,
        balance: balance.balance,
        asset_code: balance.asset_code,
        asset_issuer: balance.asset_issuer,
      };
    }

    return {
      asset_type: balance.asset_type,
      balance: balance.balance,
    };
  });

  return {
    id: account.id,
    sequence: account.sequence,
    balances,
  };
}
