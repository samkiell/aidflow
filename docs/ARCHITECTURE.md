# Architecture

## Runtime
- Next.js App Router and TypeScript serve the web app and API handlers.
- MongoDB/Mongoose store application records.
- Stellar Horizon provides read-only network/account data.
- Soroban contract code is isolated in `contract/` and is not considered deployed or production-ready.

## Implemented endpoints
- `GET /api/health`: process liveness only.
- `GET /api/ready`: verifies that MongoDB can be reached.
- `GET /api/stellar/account?publicKey=G...`: read-only account summary.
- `GET /api/campaigns?page=1&limit=20`: published campaigns only.
- `POST /api/campaigns`: temporary server-token protected campaign creation. It creates drafts by default; this is not a replacement for user sessions or organization verification.

## Planned data model
- User: email, display name, role, status, auth provider ID.
- Organization: owner ID, legal/display name, verification status, review metadata.
- Campaign: organization ID, title, description, goal, asset/network, dates, status, distribution plan.
- Contribution: campaign ID, donor reference (optional), transaction hash, network, asset, amount, verification status.
- Distribution: campaign ID, amount, category, date, public summary, private evidence references, review status.
- AuditEvent: actor ID, action, target type/ID, timestamp, safe metadata.

## Security rules
- Validate all inputs on the server.
- Verify transaction details against the configured Stellar network before counting contributions.
- Enforce authorization inside every mutation handler; never trust client-supplied roles.
- Keep secrets in server-only environment variables and never commit real `.env` files.
- Do not put beneficiary personal information in memo fields or public chain data.
- Blockchain records prove transactions, not real-world delivery. Delivery evidence and independent review remain necessary.
- Add rate limiting, abuse reporting, observability, backups, threat modelling, and dependency scanning before production.

## Production blockers
Authentication, multi-user role-based access control, organization verification, contribution verification, distribution review, audit logging, rate limiting, backup/restore drills, and an independently reviewed Soroban contract remain outstanding.
