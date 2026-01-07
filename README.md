# AUXIDIEN (AUXI)

> Volume-Weighted Precious Metals Index Token

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Solidity](https://img.shields.io/badge/solidity-0.8.20-brightgreen.svg)
![Network](https://img.shields.io/badge/network-BSC-yellow.svg)

## Overview

Auxidien (AUXI) is a decentralized index token representing a volume-weighted basket of precious metals. The index tracks spot prices of Gold, Silver, Platinum, and Palladium, weighted by their respective trading volumes.

### Key Features

- **Fixed Supply**: 100,000,000 AUXI (no inflation)
- **On-chain Oracle**: Real-time index price updates
- **Volume Weighting**: Fair representation based on market activity
- **Team Vesting**: 36-month linear vesting with 6-month cliff
- **Exchange Ready**: Professional tokenomics structure

## Index Methodology

### Tracked Metals

| Metal     | Symbol  | Source     |
|-----------|---------|------------|
| Gold      | XAUUSD  | Spot Price |
| Silver    | XAGUSD  | Spot Price |
| Platinum  | XPTUSD  | Spot Price |
| Palladium | XPDUSD  | Spot Price |

### Calculation Formula

```
AUXI = Σ(weight_i × price_i)

where:
  weight_i = notional_i / total_notional
  notional_i = volume_i × price_i
```

## Tokenomics

| Category | Allocation | Amount |
|----------|------------|--------|
| Public Distribution | 35% | 35,000,000 |
| Treasury / Corporate | 20% | 20,000,000 |
| Liquidity & Market Making | 20% | 20,000,000 |
| Team & Development | 15% | 15,000,000 |
| Strategic & Advisors | 10% | 10,000,000 |
| **Total** | **100%** | **100,000,000** |

### Team Vesting Schedule

- **Start**: Deployment + 30 days
- **Cliff**: 6 months
- **Duration**: 36 months total
- **Release**: Linear unlock after cliff
- **Custody**: On-chain smart contract

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- BSC Testnet BNB (for deployment)

### Installation

```bash
# Clone repository
git clone <repo-url>
cd auxidien

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your configuration
```

### Configuration

Edit `.env` file:

```env
PRIVATE_KEY=your_wallet_private_key
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545
BSCSCAN_API_KEY=your_bscscan_api_key

# Beneficiaries for team vesting
BENEFICIARY_1=0x...
BENEFICIARY_2=0x...
BENEFICIARY_3=0x...
```

### Deployment

```bash
# Compile contracts
npm run compile

# Deploy AUXI Token
npm run deploy:token

# Deploy Oracle
npm run deploy:oracle

# Deploy Vesting Contract
npm run deploy:vesting

# Distribute tokens according to tokenomics
npx hardhat run scripts/distributeTokens.ts --network bscTestnet
```

### Verify Contracts

```bash
# Verify on BscScan
npx hardhat verify --network bscTestnet <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Smart Contracts

### AuxiToken.sol

ERC20 token with 100M fixed supply.

```solidity
// Key functions
function distributeTokens(address recipient, uint256 amount, string category) external;
function batchDistribute(address[] recipients, uint256[] amounts, string[] categories) external;
```

### AuxidienOracle.sol

On-chain price oracle for AUXI index.

```solidity
// Key functions
function setPricePerOzE6(uint256 newPricePerOzE6) external;        // ORACLE_ROLE only
function setPriceWithMetals(...) external;                          // With individual metal prices
function getPricePerOzE6() external view returns (uint256);         // Read current price
function getPriceData() external view returns (price, updatedAt, decimals);
```

### AuxiVesting.sol

Team token vesting with cliff and linear release.

```solidity
// Key functions
function vestedAmount(uint256 scheduleId) public view returns (uint256);
function releasableAmount(uint256 scheduleId) public view returns (uint256);
function release(uint256 scheduleId) external;
function releaseAll(address beneficiary) external;
```

## Watcher Service

The watcher fetches metal prices, calculates the index, and updates the on-chain oracle.

```bash
# Start watcher
npm run watcher
```

### Integration Points

Replace placeholder data fetching with real APIs:

- TradingView Data Feed
- CME Market Data
- LBMA Reference Prices
- Forex Metal Providers

## Network Information

### BSC Testnet

- **Chain ID**: 97
- **RPC**: https://data-seed-prebsc-1-s1.binance.org:8545
- **Explorer**: https://testnet.bscscan.com
- **Faucet**: https://testnet.bnbchain.org/faucet-smart

### BSC Mainnet

- **Chain ID**: 56
- **RPC**: https://bsc-dataseed.binance.org
- **Explorer**: https://bscscan.com

## Project Structure

```
auxidien/
├── contracts/
│   ├── AuxiToken.sol          # Main token contract
│   ├── AuxidienOracle.sol     # Price oracle
│   └── AuxiVesting.sol        # Vesting contract
├── scripts/
│   ├── deployAuxiToken.ts     # Token deployment
│   ├── deployAuxidienOracle.ts # Oracle deployment
│   ├── deployAuxiVesting.ts   # Vesting deployment
│   └── distributeTokens.ts    # Token distribution
├── src/
│   └── watcher/
│       └── auxidien-index.ts  # Price watcher service
├── docs/
│   ├── TOKENOMICS.md
│   └── WHITEPAPER_TOKENOMICS.md
├── hardhat.config.ts
├── package.json
└── .env.example
```

## Security

- All contracts use OpenZeppelin libraries
- Team tokens locked in on-chain vesting
- Oracle access controlled by roles
- Price manipulation protection (max change rate)

### Audit Status

⚠️ Contracts are pending audit. Use at your own risk on mainnet.

## License

MIT License - see LICENSE file for details.

## Links

- Website: [Coming Soon]
- Documentation: [Coming Soon]
- Twitter: [Coming Soon]
- Telegram: [Coming Soon]

---

**Auxidien** - Precious Metals. On-chain. Volume-weighted.
