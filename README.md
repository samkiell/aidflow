# AidFlow

**Transparent aid, delivered.** AidFlow is a Stellar-oriented donation and aid-distribution platform in active development. It aims to make contributions easier to trace and distribution records easier to review, while protecting beneficiary privacy.

## Current implementation

- Next.js App Router and TypeScript.
- MongoDB/Mongoose connection helper and database readiness endpoint.
- Read-only Stellar Horizon account summary.
- Public listing of published campaigns with bounded pagination.
- Organization registration with pending/verified/rejected states and admin review.
- Campaign creation restricted to verified organizations and a server-side admin token.
- MongoDB-backed fixed-window rate limits for campaign discovery, campaign creation, organization registration, and contribution verification.
- Stellar payment verification before recording contributions, with a public transaction ledger that does not expose donor public keys.
- Soroban campaign-custody contract with contribution accounting, goal enforcement, owner withdrawals, failed-campaign refunds, pause/resume, typed events, and TTL maintenance methods.
- CI for application typecheck/lint/tests/build and contract lint/tests/WASM build.

## Quick start

1. Copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI` and the Stellar network settings.
3. Configure a server-only `AIDFLOW_CAMPAIGN_ADMIN_TOKEN` with at least 32 random characters for organization review and campaign creation.
4. Install dependencies with `npm install` and run `npm run dev`.

Open `http://localhost:3000`. Liveness: `/api/health`. Database readiness: `/api/ready`.

## API notes

- `GET /api/campaigns?page=1&limit=20` returns published campaigns linked to verified organizations only.
- `POST /api/organizations` submits an organization for manual review. New organizations are pending by default.
- `GET /api/organizations` lists pending submissions and `PATCH /api/organizations` records an admin verification/rejection decision. Both require `Authorization: Bearer <AIDFLOW_CAMPAIGN_ADMIN_TOKEN>`.
- `POST /api/campaigns` requires the same server-side admin token and a verified `organizationId`. The token is a temporary bootstrap mechanism, not user authentication or per-user RBAC.
- `POST /api/contributions` accepts a campaign ID and Stellar transaction hash. The server checks a successful single-operation Horizon payment, destination wallet, asset, and network before recording it. Duplicate transaction hashes are rejected.
- `GET /api/contributions?campaignId=<id>` returns a privacy-conscious public ledger only for campaigns belonging to verified organizations.
- `GET /api/stellar/account?publicKey=G...` performs a read-only lookup on the configured Stellar network.

Rate limiting trusts the `x-real-ip` header. Production deployments must configure their reverse proxy to overwrite that header; otherwise requests without it share a fallback rate-limit identity.

## Production status

**Not production-ready. Do not accept real donations yet.**

Remaining release blockers:

- Per-user authentication, role-based authorization, and separation of admin/reviewer duties.
- Distribution records, evidence handling, reviewer workflow, and immutable audit logs.
- End-to-end integration between the Soroban contract and the contribution API. The current API records direct Horizon payments; it does not verify the new contract's events.
- A monitored keeper/event indexer to refresh Soroban storage TTLs.
- A committed Cargo lockfile, independent contract/security audit, backup/restore test, incident/recovery plan, and legal/compliance review.
- Production secrets, proxy headers, monitoring, and deployment configuration must be validated in the actual hosting environment.

Keep the application on Stellar testnet until these controls and financial flows have been independently reviewed. Never commit wallet secret keys or expose beneficiary personal data.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development setup](docs/DEVELOPMENT.md)
- [Security policy](docs/SECURITY.md)
- [Soroban contract](contract/README.md)

No license has been selected yet. Add a license before accepting external contributions.
