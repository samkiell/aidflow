# AidFlow

**Transparent aid, delivered.** AidFlow is a Stellar-powered donation and aid-distribution platform concept focused on traceable contributions, accountable distribution records, and privacy-aware reporting.

## What's included
- Next.js + TypeScript app scaffold with a landing page.
- MongoDB/Mongoose connection helper.
- Read-only Stellar Horizon account summary helper and API route.
- Health-check endpoint.
- Product requirements, architecture, and development docs.
- Soroban contract workspace starter.
- GitHub Actions CI for install, typecheck, lint, and build.

## Quick start
```bash
cp .env.example .env.local
# Set MONGODB_URI in .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Health check: `http://localhost:3000/api/health`.

## Important status note
This is a starter scaffold, not a production-ready donation platform. Authentication, authorization, campaign and distribution models, payment submission and verification, and the Soroban contract logic still need implementation and review. Use Stellar testnet during development. Never commit wallet secret keys or expose beneficiary personal data.

## Documentation
- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Development setup](docs/DEVELOPMENT.md)

## License
No license has been selected yet. Add a license before accepting external contributions.
