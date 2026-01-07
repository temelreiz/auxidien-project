import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// BSC Testnet RPC endpoints
const BSC_TESTNET_RPC = process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545";

// Alternative RPC endpoints (backup)
const BSC_TESTNET_RPC_ALT = [
  "https://data-seed-prebsc-2-s1.binance.org:8545",
  "https://data-seed-prebsc-1-s2.binance.org:8545",
  "https://data-seed-prebsc-2-s2.binance.org:8545",
];

// BSC Mainnet RPC (for production deployment)
const BSC_MAINNET_RPC = process.env.BSC_MAINNET_RPC || "https://bsc-dataseed.binance.org/";

// Private key from environment
// Use a dummy key for compilation if not set
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

// BscScan API key for contract verification
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // Enable IR-based code generation for better optimization
    },
  },
  
  networks: {
    // Local development network
    hardhat: {
      chainId: 31337,
    },
    
    // BSC Testnet - Primary testing environment
    bscTestnet: {
      url: BSC_TESTNET_RPC,
      chainId: 97,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: 10000000000, // 10 gwei
    },
    
    // BSC Mainnet - Production
    bscMainnet: {
      url: BSC_MAINNET_RPC,
      chainId: 56,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      gasPrice: 5000000000, // 5 gwei
    },
  },
  
  etherscan: {
    apiKey: {
      bscTestnet: BSCSCAN_API_KEY,
      bsc: BSCSCAN_API_KEY,
      bscMainnet: BSCSCAN_API_KEY,
    },
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
      {
        network: "bscMainnet",
        chainId: 56,
        urls: {
          apiURL: "https://api.bscscan.com/api",
          browserURL: "https://bscscan.com",
        },
      },
    ],
  },
  
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  
  mocha: {
    timeout: 40000,
  },
};

export default config;
