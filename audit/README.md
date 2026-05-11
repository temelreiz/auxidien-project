# Auxidien Audit Package

This directory packages everything an auditor needs to review the Auxidien
(AUXI) smart contracts: the three Solidity sources, a flattened build of
each, a self-run Slither analysis with our take on each finding, a Hardhat
test report with line/branch coverage, and the methodology + tokenomics
documents that describe the system the contracts implement.

## What's in scope

Three contracts in `../contracts/`:

| File | LOC | Purpose |
|------|-----|---------|
| [`AuxiToken.sol`](../contracts/AuxiToken.sol) | ~90 | ERC-20, 100M fixed supply, `Ownable`. No minting after deploy. |
| [`AuxiVesting.sol`](../contracts/AuxiVesting.sol) | ~370 | Team + advisor vesting with 30-day delay, 6-month cliff, 36-month linear release, optional revocability per schedule. |
| [`AuxidienOracle.sol`](../contracts/AuxidienOracle.sol) | ~330 | Price oracle for the volume-weighted precious-metals index. Stores composite USD/oz × 1e6, individual metal prices, and committee-governed weights. Role-gated (`ORACLE_ROLE`, `ADMIN_ROLE`). |

See [`SCOPE.md`](./SCOPE.md) for the in-scope / out-of-scope cut.

## How to navigate

| Document | Purpose |
|----------|---------|
| [`SCOPE.md`](./SCOPE.md) | What is and is not in scope for this engagement. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System overview, control flow, trust model, off-chain components. |
| [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | Limitations we already accept, design choices that look risky but are intentional, and explicit non-goals. |
| [`SLITHER_FINDINGS.md`](./SLITHER_FINDINGS.md) | Our triage of every Slither finding (status: accepted / mitigated / non-issue). |
| [`slither/slither-report.txt`](./slither/slither-report.txt) | Raw Slither output. |
| [`slither/slither-report.json`](./slither/slither-report.json) | Machine-readable Slither output. |
| [`coverage/`](./coverage/) | Istanbul coverage HTML report from `hardhat coverage`. |
| [`contracts-flat/`](./contracts-flat/) | Flattened sources (single-file per contract) for tools that prefer them. |
| [`../docs/INDEX_METHODOLOGY.md`](../docs/INDEX_METHODOLOGY.md) | Index methodology (v1.1, May 2026). |
| [`../docs/TOKENOMICS.md`](../docs/TOKENOMICS.md) | Token distribution and vesting policy. |
| [`../docs/WHITEPAPER_TOKENOMICS.md`](../docs/WHITEPAPER_TOKENOMICS.md) | Investor-facing tokenomics. |

## Reproducing the analysis

```bash
# from the repo root
npm install

# tests
npx hardhat test                  # 65 tests, ~330ms
npx hardhat coverage              # writes coverage/ and coverage.json

# slither (requires solc 0.8.20 + slither >= 0.11)
pip install slither-analyzer
solc-select install 0.8.20 && solc-select use 0.8.20
slither . --filter-paths "node_modules|test|scripts"
```

## Build / chain details

- Solidity `0.8.20`
- `viaIR: true`, optimizer runs `200`
- Target chain: **BNB Smart Chain mainnet** (`chainId: 56`) for production. Testnet (`chainId: 97`) for the current end-to-end soak.
- OpenZeppelin Contracts `^5.0.0`

## Current testnet deployment

The contracts in this package have been deployed to BSC testnet and are
currently being soaked end-to-end with the off-chain watcher.

| Contract | Address | BscScan (testnet) |
|----------|---------|-------------------|
| AuxiToken | `0xeAc4AC5dDa93A8D875dD53fD3396BE8ce08F0814` | [view](https://testnet.bscscan.com/address/0xeAc4AC5dDa93A8D875dD53fD3396BE8ce08F0814) |
| AuxidienOracle | `0x681595931f042958619a56d7EFa13e9c258f8584` | [view](https://testnet.bscscan.com/address/0x681595931f042958619a56d7EFa13e9c258f8584) |
| AuxiVesting | `0x83cB6776B3e780787C498Ad9d73BDa013E7bc89C` | [view](https://testnet.bscscan.com/address/0x83cB6776B3e780787C498Ad9d73BDa013E7bc89C) |

The watcher's source lives at <https://github.com/temelreiz/auxidien-watcher>
and is included in this audit only as off-chain context (see
[`ARCHITECTURE.md`](./ARCHITECTURE.md) §3).

## Contact

For questions during the engagement:

- Primary: **bs@auxite.io**
- GitHub: <https://github.com/temelreiz/auxidien-project>
