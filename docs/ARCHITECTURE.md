# Architecture

## Runtime
- Next.js App Router and TypeScript serve the web app and API handlers.
- MongoDB/Mongoose store campaigns, organizations, contributions, and rate-limit buckets.
- Stellar Horizon verifies direct payment transactions on the configured network.
- The Soroban contract implements campaign custody, goal enforcement, withdrawals, refunds, and TTL maintenance, but is not yet integrated with the API or deployed.

## Implemented endpoints
- `GET /api/health`: process liveness.
- `GET /api/ready`: verifies MongoDB connectivity.
- `GET /api/stellar/account?publicKey=G...`: read-only account summary.
- `POST /api/organizations`: rate-limited organization submission, pending by default.
- `GET /api/organizations`: admin-only pending verification queue.
- `PATCH /api/organizations`: admin-only verification/rejection decision.
- `GET /api/campaigns?page=1&limit=20`: published, unexpired campaigns linked to verified organizations only.
- `POST /api/campaigns`: admin-token protected campaign creation for verified organizations.
- `POST /api/contributions`: verifies a successful one-operation Stellar payment against the campaign destination, asset, amount, and configured network before saving a unique transaction record.
- `GET /api/contributions?campaignId=<id>`: returns public transaction records without donor wallet addresses, and hides campaigns whose organization is not verified.

## Data model
- Organization: name, contact email, description, registration number, website, verification status, and private review metadata.
- Campaign: verified organization reference, title, description, goal, asset/network, dates, and publication status.
- Contribution: campaign ID, transaction hash, network, asset, amount, and verification status.
- RateLimit: hashed identity/scope/window counter with TTL.
- Soroban campaign: owner, token, goal, total raised, withdrawn amount, deadline ledger, and status; per-donor contribution totals are stored separately.

## Security rules
- Validate inputs on the server.
- Verify transaction details against the configured Stellar network before counting contributions.
- Campaigns can only be created for organizations with a verified status.
- Keep the admin token server-only, random, and at least 32 characters long.
- Rate limiting trusts only `x-real-ip`; production proxies must overwrite it. If absent, requests share a fallback identity.
- Do not put beneficiary personal information in memo fields or public chain data.
- Blockchain records prove transactions, not real-world delivery. Delivery evidence and independent review remain necessary.

## Production blockers
Per-user authentication and RBAC, separation of admin/reviewer duties, distribution records/evidence/review, immutable audit logs, and a contract event indexer/TTL keeper are not implemented. The API currently records direct Horizon payments rather than contract contributions. The contract has not received an independent audit, and production backups, monitoring, recovery drills, and legal/compliance review must be completed before accepting real donations.
