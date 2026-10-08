import { Horizon, Networks } from '@stellar/stellar-sdk';
export const stellarNetwork = process.env.STELLAR_NETWORK === 'public' ? 'public' : 'testnet';
export const stellarPassphrase = stellarNetwork === 'public' ? Networks.PUBLIC : Networks.TESTNET;
export const horizon = new Horizon.Server(process.env.STELLAR_HORIZON_URL || (stellarNetwork === 'public' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org'));
/** Fetches a public account summary. This does not initiate a payment or require a secret key. */
export async function getAccountSummary(publicKey: string) {
  if (!/^[G][A-Z2-7]{55}$/.test(publicKey)) throw new Error('Invalid Stellar public key.');
  const account = await horizon.loadAccount(publicKey);
  return { id: account.id, sequence: account.sequence, balances: account.balances.map((balance) => ({ asset_type: balance.asset_type, balance: balance.balance, ...(balance.asset_type !== 'native' ? { asset_code: balance.asset_code, asset_issuer: balance.asset_issuer } : {}) })) };
}
