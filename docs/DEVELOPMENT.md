# Local development

## Requirements
- Node.js 20.9 or newer
- npm
- MongoDB local instance or hosted connection string
- Rust and the Soroban CLI only if working on the contract

## Start the web app
1. Copy `.env.example` to `.env.local`.
2. Set `MONGODB_URI` to a working MongoDB database.
3. Install packages with `npm install`.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.
6. Check `http://localhost:3000/api/health`.

The account lookup endpoint is `GET /api/stellar/account?publicKey=G...`. It is read-only and defaults to Stellar testnet. Campaign discovery is `GET /api/campaigns`; the temporary campaign creation endpoint requires the server-only `AIDFLOW_CAMPAIGN_ADMIN_TOKEN`. A contribution can be recorded only by submitting its campaign ID and transaction hash to `POST /api/contributions`; the server verifies the transaction against the configured Horizon network. The public ledger is `GET /api/contributions?campaignId=<id>`.

## Before production
Configure a real authentication provider, role checks, request rate limits, observability, database backups, content validation, security review, and tests. Do not accept real donations until payment verification and contract flows have been reviewed and tested.
