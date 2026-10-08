# AidFlow

**Transparent aid, delivered.** AidFlow is a Stellar-oriented donation and aid-distribution platform in active development. It aims to make contributions easier to trace and distribution records easier to review, while protecting beneficiary privacy.

## Current implementation
- Next.js App Router and TypeScript.
- MongoDB/Mongoose connection helper.
- Read-only Stellar Horizon account summary.
- Public listing of published campaigns with bounded pagination.
- Restricted campaign creation endpoint using a server-side bootstrap token.
- Stellar payment verification before recording contributions, with a public privacy-conscious transaction ledger.
- Liveness and database readiness endpoints.
- Soroban contract workspace starter and product/architecture documentation.

## Quick start
```bash
cp .env.example .env.local
# Set MONGODB_URI in .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Liveness: `/api/health`. Database readiness: `/api/ready`.

## API notes
- `GET /api/campaigns?page=1&limit=20` returns published campaigns only.
- `POST /api/campaigns` requires `Authorization: Bearer <AIDFLOW_CAMPAIGN_ADMIN_TOKEN>`. Configure the token only in server environment variables. This temporary bootstrap mechanism is not full user authentication or role-based access control.
- `POST /api/contributions` accepts only a campaign ID and Stellar transaction hash. The server checks a successful single-operation payment, destination wallet, asset, and network against Horizon before saving it. The transaction hash is unique to prevent duplicate recording.
- `GET /api/contributions?campaignId=<id>` returns the public transaction ledger without exposing donor public keys.
- `GET /api/stellar/account?publicKey=G...` performs a read-only lookup on the configured Stellar network.

## Production status
**Not production-ready.** Authentication and organization verification, contribution submission and on-chain verification, distribution evidence and review, audit logs, rate limiting, backup/restore procedures, security review, and the Soroban contract logic still need implementation and testing. Do not accept real donations until those controls and the financial flows have been independently reviewed. Use Stellar testnet during development. Never commit wallet secret keys or expose beneficiary personal data.

## Documentation
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development setup](docs/DEVELOPMENT.md)

No license has been selected yet. Add a license before accepting external contributions.
