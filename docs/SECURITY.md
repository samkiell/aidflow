# Security Policy

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Contact the maintainers privately through GitHub's security advisory reporting feature. Include the affected component, impact, reproduction steps, and safe mitigation guidance where possible.

## Deployment rules

- Never commit secrets, private keys, production connection strings, or beneficiary data.
- Keep the app on Stellar testnet until payment and contract flows are validated.
- Treat failing CI and high/critical dependency audit findings as release blockers.
- Do not deploy the Soroban contract to mainnet without an independent review and a documented recovery plan.
- If credentials may have been exposed, rotate them. Removing a value from the current file does not invalidate it.
