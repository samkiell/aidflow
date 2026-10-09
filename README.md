# AidFlow

**Transparent aid, delivered.** AidFlow is a Stellar-oriented donation and aid-distribution platform in active development. It aims to make contributions easier to trace and distribution records easier to review, while protecting beneficiary privacy.

## Current implementation

- Next.js App Router and TypeScript.
- MongoDB/Mongoose connection helper, liveness, and database readiness endpoints.
- Scrypt password hashing, rate-limited registration/login, revocable server-side sessions, and HTTP-only strict same-site cookies.
- Donor accounts can submit one organization for manual verification; organization owners can create campaigns only after approval.
- Separate server-side campaign-admin and review tokens for bootstrap campaign creation, organization review, distribution review, and audit access.
- MongoDB-backed fixed-window rate limits for authentication, organization registration, campaign discovery/creation, contribution verification, and distribution endpoints.
- Public campaign discovery and public distribution summaries only expose records for verified organizations.
- Stellar payment verification checks successful single-operation Horizon payments, destination wallet, asset, network, positive amount, and supported decimal precision before recording contributions.
- Public contribution records do not expose donor public keys.
- Distribution submissions require a verified organization owner, a private evidence reference, and reviewer approval. Public responses omit evidence references and review notes.
- Append-only application-level audit events for organization review, campaign creation, contribution verification, and distribution review.
- Soroban campaign-custody contract with contribution accounting, goal enforcement, withdrawals, failed-campaign refunds, pause/resume, typed events, and TTL maintenance methods.
- CI covers application typecheck/lint/tests/build, production dependency audits, and contract lint/tests/WASM build.

## Quick start

1. Copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI` and the Stellar network settings.
3. Set separate, server-only `AIDFLOW_CAMPAIGN_ADMIN_TOKEN` and `AIDFLOW_REVIEW_TOKEN` values, each with at least 32 random characters.
4. Install dependencies with `npm install` and run `npm run dev`.

Open `http://localhost:3000`. Liveness: `/api/health`. Database readiness: `/api/ready`.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`: account and session management.
- `POST /api/organizations`: authenticated donor submits an organization for manual review.
- `GET /api/organizations` and `PATCH /api/organizations`: review-token protected pending queue and verification decision.
- `GET /api/campaigns?page=1&limit=20`: published, unexpired campaigns linked to verified organizations.
- `POST /api/campaigns`: verified organization owners can create campaigns for their own organization; the campaign-admin token remains available for controlled bootstrap operations.
- `POST /api/contributions`: verifies a successful single-operation Stellar payment against campaign destination, asset, amount, and network before recording it.
- `GET /api/contributions?campaignId=<id>`: privacy-conscious public contribution ledger.
- `POST /api/distributions`: verified organization owners submit a distribution with a private evidence reference.
- `GET /api/distributions?campaignId=<id>`: approved public distribution summaries only.
- `GET /api/distributions?review=pending` and `PATCH /api/distributions`: review-token protected queue and approval/rejection.
- `GET /api/audit`: review-token protected paginated audit log.
- `GET /api/stellar/account?publicKey=G...`: read-only Stellar account summary.

Rate limiting trusts the `x-real-ip` header. Production deployments must configure their reverse proxy to overwrite that header; otherwise requests without it share a fallback rate-limit identity.

## Production status

**Not production-ready. Do not accept real donations yet.**

Remaining release blockers:

- Email verification, password reset/recovery, MFA, and stronger admin/reviewer identity and separation of duties.
- Evidence upload and private object storage; the current distribution API accepts a private evidence reference but does not verify that a file exists or preserve a signed evidence chain.
- Atomic database transactions and reconciliation across contribution records, distribution reservations, and audit events.
- End-to-end integration between the Soroban contract and the contribution API. The current API verifies direct Horizon payments; it does not verify this contract's events.
- A monitored contract event indexer and TTL keeper. Soroban storage expires unless refreshed.
- A committed Cargo lockfile, independent contract/security audit, backup/restore test, monitoring, incident/recovery plan, and legal/compliance review.
- Production secrets, proxy headers, and hosting configuration must be validated in the actual environment.

Keep the application on Stellar testnet until these controls and financial flows have been independently reviewed. Never commit wallet secret keys or expose beneficiary personal data.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development setup](docs/DEVELOPMENT.md)
- [Security policy](docs/SECURITY.md)
- [Soroban contract](contract/README.md)

No license has been selected yet. Add a license before accepting external contributions.
