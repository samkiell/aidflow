# AidFlow Soroban contract

The contract targets Soroban SDK 28.0.0 for Stellar Protocol 29 and implements campaign registration, token custody, goal enforcement, owner withdrawals, donor refunds, pause/resume, typed events, and storage-TTL maintenance. It is a separate on-chain component; the current Next.js contribution API still verifies direct Horizon payment operations and does **not** submit or verify this contract's events.

## Contract interface

- `initialize(admin)`: set the administrator once.
- `create_campaign(admin, id, owner, token, goal_amount, end_ledger)`: register a campaign after off-chain organization verification.
- `contribute(campaign_id, donor, amount)`: transfer tokens into contract custody, record the donor, and reject overfunding.
- `withdraw(campaign_id, owner)`: release the raised balance only after the campaign goal is reached.
- `refund(campaign_id, donor, amount)`: permit partial donor refunds after the deadline when the goal was not met.
- `pause_campaign` / `resume_campaign`: admin-controlled campaign pause.
- `get_campaign`, `get_contribution`, and `get_admin`: read campaign state.
- `maintain_campaign` and `maintain_contribution`: permissionless TTL refresh methods for an off-chain keeper.

Amounts are expressed in the token's smallest unit. Campaign IDs are Soroban symbols, so integration must define a stable mapping from MongoDB campaign IDs.

## Storage and operations

Soroban storage expires unless its TTL is refreshed. Run a monitored keeper that calls `maintain_campaign` and `maintain_contribution` before their ledger TTLs expire, using emitted campaign/contribution events to discover records. The keeper is not implemented in this repository yet. Losing the TTL can make campaign or donor records unavailable.

## Build and test

Run these from the repository root:

- `cargo fmt --manifest-path contract/Cargo.toml --all -- --check`
- `cargo clippy --manifest-path contract/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path contract/Cargo.toml`
- `cargo build --manifest-path contract/contracts/aidflow/Cargo.toml --target wasm32v1-none --release`

## Release gate

**Do not deploy this contract to mainnet or accept real funds yet.** The direct-payment API is not integrated with this contract, the TTL keeper and event indexer are missing, and the contract has not had an independent security audit. Validate all transitions on testnet, add end-to-end tests, and document recovery and incident procedures before mainnet deployment.
