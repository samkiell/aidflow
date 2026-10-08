# AidFlow Soroban contract workspace

This folder reserves the contract workspace for reviewed on-chain campaign or escrow logic. The MVP must not assume that a blockchain transaction proves real-world aid delivery.

## Prerequisites
Install Rust, the `wasm32v1-none` target, and Soroban CLI using the official Stellar documentation for your platform.

## Planned contract responsibilities
- Define campaign/fund state transitions explicitly.
- Restrict administrative actions to authorized identities.
- Emit events useful for off-chain indexing.
- Include tests for authorization, invalid transitions, edge cases, and accounting invariants.

Do not deploy a contract holding real funds until its design, tests, and independent security review are complete.
