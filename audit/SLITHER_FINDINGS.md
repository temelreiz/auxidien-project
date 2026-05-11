# Slither Findings — Triage

Run command:

```bash
slither . --filter-paths "node_modules|test|scripts"
```

Result line at the end of the run: **18 contracts analysed, 101 detectors,
13 result(s) found.** No high- or medium-severity findings. The full
report is in [`slither/slither-report.txt`](./slither/slither-report.txt)
(human readable) and [`slither/slither-report.json`](./slither/slither-report.json)
(machine readable).

Triage summary:

| Detector | Count | Severity | Status |
|----------|-------|----------|--------|
| `timestamp` (block.timestamp in comparisons) | 11 | informational | Accepted |
| `costly-loop` (state write in constructor loop) | 1 | informational | Accepted |
| `incorrect-equality` (strict eq on uint) | 1 | informational | Accepted |

## `timestamp` — 11 findings

Locations:

- `AuxiVesting.vestedAmount`, `releasableAmount`, `release`, `releaseAll`,
  `revoke`, `changeBeneficiary`, `isFunded`, `getVestingInfo`
- `AuxidienOracle.setPricePerOzE6`, `setPriceWithMetals`, `isStale`

All use `block.timestamp` (directly or transitively) in `require` or
branching comparisons.

**Why accepted.** Vesting time scales are 30 days, 6 months, and 36
months. Oracle's `minUpdateInterval` is `>= 60` in production
(testnet currently runs at 300). Miners on BSC can shift the timestamp
by at most a few seconds; that does not enable any meaningful bypass of
a 1-minute rate limit or a 6-month cliff. This is the standard accepted
pattern for vesting contracts (see OpenZeppelin `VestingWallet`, which
exhibits the same Slither finding).

See [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) §3 for more detail.

## `costly-loop` — 1 finding

Location: `AuxiVesting.constructor` line `totalCommitted += amounts[i]`.

**Why accepted.** Constructor runs once at deploy with three
beneficiaries in production. The cost is negligible (a few thousand
gas per iteration). See [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) §4.

If the auditor still wants this fixed, the change is mechanical:
sum amounts into a local before the loop and write `totalCommitted` once
after. Happy to apply on request.

## `incorrect-equality` — 1 finding

Location: `AuxidienOracle.isStale` — `lastUpdateAt == 0`.

**Why accepted.** `lastUpdateAt` is initialised to zero and only ever
assigned the result of `block.timestamp` (always > 0). The strict
equality is the cleanest way to detect "never published" and there is
no manipulation path because the only writer is the contract itself.

This is a false positive for strict-equality concerns, which are really
about comparing with arbitrary-user-controlled balances or token amounts.

## What was NOT found

For the auditor's confidence, Slither did **not** report:

- Reentrancy (`reentrancy-eth`, `reentrancy-no-eth`, etc.)
- Uninitialised state
- Suicidal / self-destruct paths
- Tx-origin authentication
- Arbitrary external calls
- Delegatecall / unprotected upgrade patterns
- Locked Ether
- Shadowing of state variables
- Missing zero-address checks on the constructor-supplied admin or owner

We treat the absence of these as a signal of baseline hygiene, not as a
substitute for the manual audit.
