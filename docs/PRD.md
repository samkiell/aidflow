# AidFlow Product Requirements Document

## Product
AidFlow is a donation and aid-distribution platform designed to make campaign funding and aid delivery more transparent. Stellar provides public transaction references; MongoDB stores application records and evidence metadata.

## Users
- Donors who want to understand where contributions go.
- Verified aid organizations that create campaigns and record distribution.
- Administrators who review organizations, campaigns, reports, and disputes.
- Beneficiaries whose personal data must be handled with care.

## Core workflows
1. Organization registration and admin verification.
2. Campaign creation with purpose, target, currency, dates, budget, and delivery plan.
3. Campaign discovery and public campaign detail pages.
4. Wallet connection and contribution flow, initially on Stellar testnet.
5. Transaction verification and campaign ledger.
6. Aid distribution records with evidence metadata and reviewer status.
7. Public campaign reporting, progress, and downloadable audit trail.
8. Admin review, moderation, fraud reports, and audit logs.

## MVP acceptance criteria
- Users can browse campaigns without signing in.
- Organizations cannot publish campaigns until approved.
- Every recorded contribution has a validated transaction hash and network.
- Campaign totals are derived from verified transactions, not client-submitted values.
- Distribution entries include amount, timestamp, category, and review status.
- Private beneficiary information is never published to the public ledger or public API.
- Admin actions are authenticated, authorized, and auditable.
- Clear empty, loading, error, and success states exist across primary flows.

## Technical decisions
- Next.js App Router, TypeScript, React.
- MongoDB with Mongoose for application data.
- Stellar SDK and Horizon for account/transaction reads; Soroban contract integration is a separate, reviewed milestone.
- Zod for server-side input validation.
- Secrets stay server-side; never store wallet secret keys in MongoDB or expose them to the browser.

## Non-goals for the first MVP
- Custodial wallet storage.
- Claims that on-chain transactions alone prove real-world delivery.
- Public exposure of beneficiary identities or sensitive evidence.
- Production fund custody before security review, threat modelling, and legal/compliance review.

## Suggested milestones
1. Foundation, design system, database models, auth and roles.
2. Organization onboarding and campaign CRUD.
3. Stellar wallet connection, testnet contributions and transaction verification.
4. Distribution records, evidence review and public reporting.
5. Admin dashboard, tests, threat model, deployment and pilot.
