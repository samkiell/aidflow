# Architecture

## Application
- `app/`: Next.js routes, pages, and API handlers.
- `lib/mongodb.ts`: cached Mongoose connection.
- `lib/stellar.ts`: network configuration and read-only Horizon helpers.
- `models/`: MongoDB schemas to add as domain workflows are implemented.
- `contract/`: Soroban contract workspace starter, separate from the Next.js app.

## Initial data model proposal
- `User`: email, display name, role, status, auth provider ID.
- `Organization`: owner ID, legal/display name, verification status, review metadata.
- `Campaign`: organization ID, title, description, goal, asset/network, dates, status, distribution plan.
- `Contribution`: campaign ID, donor reference (optional), transaction hash, network, asset, amount, verification status.
- `Distribution`: campaign ID, amount, category, date, public summary, private evidence references, review status.
- `AuditEvent`: actor ID, action, target type/ID, timestamp, safe metadata.

## Security rules
- Validate all inputs on the server.
- Verify transaction details against the configured Stellar network before counting contributions.
- Use least-privilege roles and enforce authorization inside every mutation handler.
- Keep secrets in environment variables; do not commit `.env` files.
- Do not put personal beneficiary information in memo fields or public chain data.
- Add rate limiting, abuse reporting, backups, monitoring, and dependency scanning before production.
