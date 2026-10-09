# Architecture

## Runtime
- Next.js App Router and TypeScript serve the web app and API handlers.
- MongoDB/Mongoose store users, expiring sessions, organizations, campaigns, contributions, distributions, audit events, and rate-limit buckets.
- Stellar Horizon verifies direct payment transactions on the configured network.
- The Soroban contract implements campaign custody, goal enforcement, withdrawals, refunds, and TTL maintenance, but is not yet integrated with the API or deployed.

## Implemented endpoints
- `GET /api/health`: process liveness.
- `GET /api/ready`: verifies MongoDB connectivity.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`: account and session management.
- `POST /api/organizations`: authenticated donor submits one organization, pending by default.
- `GET /api/organizations`: review-token protected pending queue.
- `PATCH /api/organizations`: review-token protected verification/rejection decision.
- `GET /api/campaigns?page=1&limit=20`: published, unexpired campaigns linked to verified organizations only.
- `POST /api/campaigns`: authenticated verified organization owner or campaign-admin token creates a campaign for a verified organization.
- `POST /api/contributions`: verifies a successful one-operation Stellar payment against campaign destination, asset, network, amount precision, and supported amount range before saving a unique transaction record.
- `GET /api/contributions?campaignId=<id>`: public transaction records without donor wallet addresses; hidden when the organization is not verified.
- `POST /api/distributions`: verified organization owners submit a distribution and private evidence reference.
- `GET /api/distributions?campaignId=<id>`: approved public summaries only.
- `GET /api/distributions?review=pending`, `PATCH /api/distributions`: review-token protected queue and approval/rejection.
- `GET /api/audit`: review-token protected audit log.
- `GET /api/stellar/account?publicKey=G...`: read-only account summary.

## Data model
- User: name, email, scrypt password hash, role, status, and optional organization reference.
- Session: hashed opaque token and expiry; browser cookie is HTTP-only, strict same-site, and secure in production.
- Organization: owner, contact email, description, registration number, website, verification status, and private review metadata.
- Campaign: verified organization reference, goal, asset/network, dates, publication status, and reserved distributed amount.
- Contribution: campaign ID, transaction hash, amount, asset, network, and ledger.
- Distribution: campaign ID, amount, category, public summary, private evidence reference, and review state.
- AuditLog: append-only application-level records of privileged and financial state changes.
- RateLimit: hashed identity/scope/window counter with TTL.
- Soroban campaign: owner, token, goal, total raised, withdrawn amount, deadline ledger, and status; per-donor contribution totals are stored separately.

## Security rules
- Validate all input on the server.
- Store passwords as scrypt hashes, never plaintext; store only hashes of session tokens.
- Enforce same-origin browser mutations, HTTP-only cookies, expiring sessions, and rate limits.
- Keep campaign and review tokens server-only, random, and at least 32 characters long; use different values.
- Verify transaction details against the configured Stellar network before counting contributions.
- Campaigns and distributions are visible only for verified organizations; only approved distribution summaries are public.
- Rate limiting trusts only `x-real-ip`; production proxies must overwrite it.
- Do not put beneficiary personal information in memo fields or public chain data.
- Blockchain records prove transactions, not real-world delivery. Delivery evidence and independent review remain necessary.

## Production blockers
Email verification, password recovery, MFA, per-reviewer identities, evidence object storage, and fully atomic transactions across financial records and audit events are not implemented. The API currently records direct Horizon payments rather than contract contributions. The contract event indexer/TTL keeper, committed Cargo lockfile, independent security audit, backup/restore test, monitoring, recovery drills, and legal/compliance review are also required before accepting real donations.
