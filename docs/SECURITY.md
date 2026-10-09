# Security Policy

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Contact the maintainers privately through GitHub's security advisory reporting feature. Include the affected component, impact, reproduction steps, and safe mitigation guidance where possible.

## Deployment rules

- Never commit secrets, private keys, production connection strings, or beneficiary data.
- Keep the app on Stellar testnet until payment and contract flows are validated end to end.
- Configure `AIDFLOW_CAMPAIGN_ADMIN_TOKEN` as a server-only secret with at least 32 random characters. Rotate it immediately if exposed.
- Configure the reverse proxy to overwrite `x-real-ip`; rate limiting must not trust caller-controlled forwarding headers.
- Keep organization verification and campaign creation restricted to the admin endpoint until per-user authentication and RBAC exist.
- Treat failed typecheck/lint/tests/build and high/critical **production dependency** audit findings as release blockers. Development-tool advisories are reported separately and still require review.
- Do not deploy the Soroban contract to mainnet without event-indexer/API integration, a monitored TTL keeper, an independent audit, and a documented recovery plan.
- Test database backup restoration and incident response before storing real donor or beneficiary records.
- Removing a secret from the current file does not invalidate it; rotate the credential at its source.
