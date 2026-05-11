# Known issues and accepted design choices

These are findings we have already considered and deliberately accepted.
We document them so the audit report can mark them "Acknowledged" rather
than re-raise them.

## 1. Trust in the off-chain watcher

The composite index price is computed off-chain. The watcher could
publish a price that does not match the underlying metal prices it
publishes alongside (within the on-chain `maxPriceChangeRate`).

- **Mitigation today**: `setPriceWithMetals` records the four constituent
  prices so an independent observer can recompute the composite and
  alert. The 3% off-chain step limiter and 10% on-chain cap bound the
  abuse window.
- **Future**: a contract-side recomputation that compares the supplied
  composite to `Σ (price_i × weight_i) / 10_000` and reverts on disagreement
  beyond a tolerance. Not in v1 because of gas considerations and because
  it would tie watcher gas cost to the four metal prices instead of one.

## 2. Single oracle key

Only one address can hold `ORACLE_ROLE` at a time in our current operational
model. The contract supports multiple `ORACLE_ROLE` holders (it is an
`AccessControl` role, not a singleton), but the watcher process is
single-instance. If the key is compromised, an attacker can publish
within the caps until the admin multisig rotates the role.

- **Mitigation**: cap rate (10% on-chain, 3% off-chain), update interval,
  multisig-only role management.
- **Future**: median of multiple watchers, each holding its own key,
  with a contract-side aggregator. Not in v1 because of feed availability
  (we have only one paid source today) and audit-scope cost.

## 3. `block.timestamp` use

`AuxiVesting` and `AuxidienOracle` use `block.timestamp` for cliff
checks, vesting interpolation, and update-interval enforcement. Slither
flags every comparison.

- **Why accepted**: vesting time scales are months and years; miner
  manipulation (a few seconds) is irrelevant. Oracle's `minUpdateInterval`
  is at least 60 seconds in production (testnet uses 300 s) — the few
  seconds a miner can shift the timestamp do not enable any meaningful
  bypass of the rate limit.
- See [`SLITHER_FINDINGS.md`](./SLITHER_FINDINGS.md) for the per-finding
  view.

## 4. `costly-loop` in `AuxiVesting` constructor

Slither reports `totalCommitted += amounts[i]` inside a constructor loop.

- **Why accepted**: the constructor runs once at deploy. The team
  deployment has three beneficiaries. Even a hypothetical 1,000-element
  deployment would cost a few hundred thousand gas in total. Optimising
  this loop into a single sum is a micro-optimisation we are happy to
  apply if the audit team flags it again, but it is not a security or
  cost concern.

## 5. `setMaxPriceChangeRate` cap is the only safety on extreme moves

The admin multisig can call `setMaxPriceChangeRate(rate)` and set `rate`
up to `10_000` (100%). At 100% the per-update cap is effectively
disabled.

- **Why accepted**: the admin is a multisig. Setting a 100% rate is a
  conscious risk and the change emits `MaxPriceChangeRateChanged` for
  visibility. The off-chain watcher's `ORACLE_MAX_STEP_BPS = 300`
  (3%) still applies regardless, so a stolen admin key alone cannot
  cause a 100% spike unless the watcher key is also compromised.
- **Future**: an absolute cap (e.g. 5000 bps maximum even for admin) is
  worth considering. We did not add one in v1 because we want the
  flexibility to relax the cap during a methodology change (e.g. when
  adding a new metal).

## 6. No emergency pause

Neither contract has a `Pausable` mixin. The oracle can be "frozen" by
revoking `ORACLE_ROLE` from the watcher, which stops new updates but
does not roll back a malicious one. Vesting has no kill switch.

- **Why accepted**: a pause function on the token would let the owner
  freeze ERC-20 transfers, which we consider worse for trust than the
  absence of a pause. Vesting schedules are non-revocable by design for
  team allocations; a pause would let the owner indirectly delay vested
  releases.
- **Future**: a more constrained pause (only on `setPriceWithMetals`,
  expires automatically after N hours) could be useful for incident
  response. Out of scope for v1.

## 7. `changeBeneficiary` lets the owner reassign a schedule

`changeBeneficiary` is callable by both the beneficiary and the owner.
The owner can therefore reassign a schedule to a different address.

- **Why accepted**: this is intentional. If a beneficiary loses their
  key, the multisig needs a path to recover the schedule. Removing the
  owner's ability here would create a permanently lost-funds scenario.
- **Risk**: a malicious or compromised owner could reassign team
  schedules to themselves. Mitigation is the multisig threshold.

## 8. Public-distribution and treasury are not vested

Only the 15M team allocation (and any advisor schedules added later)
flow through `AuxiVesting`. Public, treasury, liquidity, and the rest
of the supply move freely from the owner once `distributeTokens` /
`batchDistribute` are called.

- **Why accepted**: matches the tokenomics document and is the standard
  pattern. Liquidity needs to be free to seed pools; public distribution
  needs to be free for IDO / community programs.

## 9. Re-entrancy guard scope

`AuxiVesting` uses `ReentrancyGuard.nonReentrant` on `release`,
`releaseAll`, and `revoke` — every function that transfers tokens out.
View functions and `changeBeneficiary` are not guarded because they do
not move funds.

- **Why accepted**: standard pattern, mirrors OpenZeppelin's vesting
  reference implementations.

## 10. No EIP-2612 permit / EIP-712 features on the token

`AuxiToken` is a plain ERC-20. No `permit`, no `votes`, no `flash-mint`.

- **Why accepted**: keeps the surface minimal for v1. Permit can be added
  in a v2 via an upgrade path if there is demand.
