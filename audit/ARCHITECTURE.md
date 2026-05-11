# Architecture

## 1. System overview

Auxidien is a precious-metals price index represented by a fixed-supply
ERC-20 token. The on-chain system has three components:

```
                 ┌──────────────────────────┐
                 │       AuxiVesting        │
                 │  (holds 15M AUXI locked  │
                 │   for the team, vests    │
                 │   linearly over 3y)      │
                 └────────────▲─────────────┘
                              │ ERC-20 transfers
                              │ (release / revoke)
                              │
   ┌───────────────────────┐  │  ┌──────────────────────────┐
   │       AuxiToken       │──┘  │      AuxidienOracle      │
   │  ERC-20, 100M fixed   │     │  Publishes composite     │
   │  supply, Ownable      │     │  USD/oz × 1e6 + the four │
   │                       │     │  constituent metal       │
   │                       │     │  prices + the index      │
   └───────────────────────┘     │  weights.                │
                                 └──────────────▲───────────┘
                                                │ setPriceWithMetals
                                                │ (ORACLE_ROLE only)
                                                │
                                  ┌─────────────┴──────────────┐
                                  │   Off-chain watcher        │
                                  │   (auxidien-watcher repo)  │
                                  │   Reads on-chain weights,  │
                                  │   fetches GoldAPI prices,  │
                                  │   publishes composite      │
                                  │   hourly.                  │
                                  └────────────────────────────┘
```

There are no cross-contract calls inside this codebase. The vesting
contract is the only one that holds AUXI on behalf of users.

## 2. Trust boundaries

| Role | Holder | What it can do |
|------|--------|----------------|
| `Ownable.owner` (AuxiToken) | Deployer at first, multisig at mainnet launch | `distributeTokens`, `batchDistribute` (limited to its own AUXI balance — does **not** mint). |
| `Ownable.owner` (AuxiVesting) | Deployer at first, multisig at mainnet launch | `revoke` (only on schedules created `revocable=true`), `release` on behalf of beneficiaries, `changeBeneficiary`. |
| `DEFAULT_ADMIN_ROLE` (AuxidienOracle) | Constructor `admin` argument (multisig) | Grant/revoke any role. |
| `ADMIN_ROLE` (AuxidienOracle) | Same multisig | `setWeights`, `setMinUpdateInterval`, `setMaxPriceChangeRate`, `grantOracleRole`, `revokeOracleRole`. |
| `ORACLE_ROLE` (AuxidienOracle) | Hot key on the off-chain watcher | `setPricePerOzE6`, `setPriceWithMetals` — within the rate / step limits enforced on-chain. |
| Beneficiaries (AuxiVesting) | The three team members, plus any future advisors | `release(scheduleId)`, `releaseAll(self)`, `changeBeneficiary(self, newAddr)` for their own schedules. |

**Key invariants:**

- The oracle hot key cannot drain funds, mint tokens, change weights, or
  manage roles.
- The `ADMIN_ROLE` cannot mint tokens or steal vested allocations
  (it is on a different contract). It can change weights and rate limits
  but every change emits an event.
- The vesting owner cannot accelerate a non-revocable schedule.

## 3. Off-chain context (not in scope but informative)

The watcher (`temelreiz/auxidien-watcher`) is a Node.js daemon that:

1. Reads `getWeights()` from `AuxidienOracle` each tick. Aborts the tick
   if the four basis-point values do not sum to `10_000` (defensive check
   against partial upgrades).
2. Fetches XAU/XAG/XPT/XPD spot prices in USD/oz from GoldAPI, with a
   60-second cache and 300 ms inter-request delay.
3. Computes `composite = Σ (w_i × price_i) / 10_000`.
4. Clamps the move with an off-chain `ORACLE_MAX_STEP_BPS` (default 3%)
   on top of the contract-level `maxPriceChangeRate` (default 10%).
5. Calls `setPriceWithMetals(composite, gold, silver, platinum, palladium)`
   so the constituent prices are stored on-chain alongside the composite.

The watcher signer holds **only `ORACLE_ROLE`**. Loss of the key:

- Lets an attacker publish prices within the on-chain caps (max ±10% per
  update, no faster than every `minUpdateInterval` seconds).
- Cannot mint tokens, change weights, drain vested funds, or change any
  role.

Mitigation if the key leaks: admin multisig calls `revokeOracleRole(old)`
and `grantOracleRole(new)` and rotates the watcher's `.env`.

## 4. Vesting schedule (default)

All defaults are set in the `AuxiVesting` constructor, immutable thereafter:

- `start = block.timestamp + 30 days` — the 30-day delay protects against
  immediate-release after a misconfigured deploy.
- `cliff = start + 180 days` — first six months unlock nothing.
- `end = start + 1095 days` — total vesting duration 36 months.
- Release is linear between `cliff` and `end`.
- Default deployment uses three beneficiaries each receiving 5,000,000 AUXI
  (`revocable = false`).

The constructor accepts any number of beneficiaries with arbitrary
amounts and per-schedule `revocable` flags; the production deployment
will use the three-beneficiary, non-revocable setup but advisor
schedules will be added later with `revocable = true`.

## 5. Oracle math

```
composite_E6 = Σ (price_i_E6 × weight_i_bps) / 10_000
```

Where `price_i_E6` is the i-th metal's spot price in USD/oz × 10^6 and
`weight_i_bps` is the on-chain weight in basis points. The watcher
performs this calculation off-chain because the contract trusts the
watcher to deliver the composite directly — but it records all four
constituent prices via `setPriceWithMetals` so an independent observer
can recompute and verify.

The on-chain caps that bound watcher behaviour are:

- `maxPriceChangeRate` (default 1000 bps = 10%): rejects updates whose
  absolute delta from the prior price exceeds the rate.
- `minUpdateInterval` (default 300 s in `deployAuxidienOracle.ts`):
  rejects updates faster than the interval.
- Zero price rejected unconditionally.

## 6. Build / network details

- Solidity `0.8.20`, optimizer runs `200`, `viaIR: true`.
- Hardhat networks: `bscTestnet` (chainId 97) and `bscMainnet` (chainId 56).
- Etherscan verification configured for both networks.
