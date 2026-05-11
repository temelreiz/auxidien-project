# Audit Scope

## In scope

The three Solidity contracts in [`../contracts/`](../contracts/):

1. **`AuxiToken.sol`** — ERC-20 token contract.
2. **`AuxiVesting.sol`** — Vesting contract for team and advisor allocations.
3. **`AuxidienOracle.sol`** — Index price oracle with on-chain weights.

Total: ~790 lines of Solidity, three contracts, one shared OpenZeppelin
dependency set.

### Reviewer should evaluate

- **Access control** (`Ownable`, `AccessControl`, `ORACLE_ROLE`, `ADMIN_ROLE`).
- **Token supply integrity** — no path can mint beyond the constructor's
  `INITIAL_SUPPLY = 100_000_000 * 1e18`.
- **Vesting math correctness** — cliff/start/end timestamps, linear release,
  revocation accounting, `releaseAll` over multiple schedules.
- **Oracle anti-manipulation** — `maxPriceChangeRate`, `minUpdateInterval`,
  zero-price and stale-data guards.
- **Weights governance** — `setWeights` admin-only path, sum-to-`10_000`
  invariant, `WeightsChanged` event coverage of all mutation sites
  (including the constructor).
- **Reentrancy** — `AuxiVesting` uses `ReentrancyGuard` + `SafeERC20`;
  please verify no path bypasses the guard or makes external calls before
  state updates.
- **Integer overflow / underflow** — Solidity 0.8 catches by default;
  please call out any unchecked block that would mis-handle edge cases.
- **Event coverage** — every state mutation should emit. Please flag any
  missed event.

## Out of scope

- **Off-chain watcher** (`temelreiz/auxidien-watcher`). It only holds
  `ORACLE_ROLE`; compromising it can move the oracle price within
  `maxPriceChangeRate` but cannot mint, drain, or change weights. Worth
  a light architectural read (see [`ARCHITECTURE.md`](./ARCHITECTURE.md) §3),
  not a line-by-line audit.
- **Front-end / admin dashboard** (`temelreiz/auxidien-admin`,
  `temelreiz/website-auxidien`). Pure UIs that read on-chain state and
  optionally send admin transactions via wallet; no contract logic.
- **Deployment scripts** (`scripts/`). They are operator-run, one-shot
  deployments to a testnet/mainnet RPC. Behaviour after deploy is what
  the on-chain code dictates. Misuse (e.g. wrong constructor args) is
  the operator's responsibility.
- **OpenZeppelin v5 itself**. We use the published, audited library.
  Please assume it is correct and flag only misuse on our side.
- **Whitepaper / docs** — review for technical accuracy is welcome, but
  not part of the formal audit deliverable.
- **PancakeSwap LP / Pinksale lock / DEX listing flow** — none of these
  exist as contracts in this repo. They are off-chain operational steps
  taken at mainnet launch.

## Severity expectations

We follow the OpenZeppelin / Trail of Bits convention:

- **Critical** — direct theft of funds, unauthorized mint, owner takeover,
  full denial-of-service of the protocol.
- **High** — significant value loss, time-window theft, broken vesting
  schedule, oracle manipulation that defeats the on-chain caps.
- **Medium** — confused-deputy, missed event leading to bad UX state,
  silent role lifecycle issues.
- **Low** — gas inefficiencies that materially affect users, style /
  best-practice deviations.
- **Informational** — anything that does not affect security or correctness
  but is worth noting.

Please use these labels in the final report.

## Deliverables we expect

1. A written report (PDF or Markdown) listing each finding with:
   severity, location, description, recommended fix, and our response
   (we will fill in after each round).
2. Re-test confirmation after fixes are applied.
3. (Optional) A short summary letter we can publish.

## Known accepted risks

See [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md). Findings already documented
there should be marked "Acknowledged" in the report rather than re-raised.
