# Local development

## Requirements
- Node.js 20.9 or newer for the web app
- npm
- MongoDB local instance or hosted connection string
- Rust and the Stellar CLI (v28.1.0+) for contract tests and WASM builds

## Start the web app
1. Copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI` to a working MongoDB database.
3. Set separate random `AIDFLOW_CAMPAIGN_ADMIN_TOKEN` and `AIDFLOW_REVIEW_TOKEN` values of at least 32 characters.
4. Install packages with `npm install`.
5. Run `npm run dev`.
6. Open `http://localhost:3000` and check `/api/health` and `/api/ready`.

## API workflow
- Register and log in through `POST /api/auth/register` and `POST /api/auth/login`. The server sets an HTTP-only session cookie.
- Submit an organization through `POST /api/organizations` while signed in. It remains pending until a reviewer uses `GET /api/organizations` and `PATCH /api/organizations`.
- Verified organization owners can create campaigns and submit distribution records. Reviewers use `GET /api/distributions?review=pending` and `PATCH /api/distributions`.
- The account lookup endpoint is `GET /api/stellar/account?publicKey=G...`; it is read-only.
- A contribution is recorded only after the server verifies a Stellar transaction against the configured Horizon network. The public ledger is `GET /api/contributions?campaignId=<id>`.
- `GET /api/audit` exposes paginated audit events to the review token only.

Rate limiting uses `x-real-ip`; production proxies must overwrite that header. The current contribution API still verifies direct Horizon payments and is not integrated with the Soroban custody contract.

## Before production
Complete email verification, password recovery, MFA, per-reviewer identity, private evidence upload/storage, atomic transaction/reconciliation tests, the contract event indexer and TTL keeper, an independent security audit, database backup/restore testing, monitoring, incident recovery, and legal/compliance review. Do not accept real donations until these controls and all financial flows have been reviewed.
