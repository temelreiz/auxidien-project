# Auxidien (AUXI)

Auxidien is a volume-weighted precious metals index token. The on-chain index combines spot prices for the four most actively traded precious metals (Gold, Silver, Platinum, Palladium) into a single price feed maintained by an off-chain oracle.

This repository contains the Solidity smart contracts, deployment scripts, and methodology documentation.

## Contracts

| Contract | Purpose |
|----------|---------|
| [`AuxiToken.sol`](./contracts/AuxiToken.sol) | ERC-20 token, 100M fixed supply, no minting after deploy |
| [`AuxiVesting.sol`](./contracts/AuxiVesting.sol) | Team/advisor vesting — 30d start, 6mo cliff, 36mo linear |
| [`AuxidienOracle.sol`](./contracts/AuxidienOracle.sol) | Index price oracle with role-based access and anti-manipulation guards |

## Related repositories

- [`auxidien-watcher`](https://github.com/temelreiz/auxidien-watcher) — Off-chain price oracle watcher (publishes to `AuxidienOracle`)
- [`auxidien-admin`](https://github.com/temelreiz/auxidien-admin) — Admin dashboard
- [`website-auxidien`](https://github.com/temelreiz/website-auxidien) — Public website

## Documentation

- [Index methodology](./docs/INDEX_METHODOLOGY.md)
- [Tokenomics](./docs/TOKENOMICS.md)
- [Whitepaper tokenomics section](./docs/WHITEPAPER_TOKENOMICS.md)

## Development

```bash
npm install
cp .env.example .env  # fill in PRIVATE_KEY, BSCSCAN_API_KEY, etc.

npm run compile
npm test
npm run coverage
```

### Deployment (BSC testnet)

```bash
npm run deploy:token
npm run deploy:oracle
npm run deploy:vesting
```

After deployment, verify on BscScan:

```bash
npx hardhat verify --network bscTestnet <address> <constructor args>
```

## Links

- Website: https://auxidien.io
- Research: https://auxidien.substack.com

## Disclaimer

This repository is provided for informational purposes only and does not constitute financial advice.
