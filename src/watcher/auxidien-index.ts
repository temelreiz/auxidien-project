import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * AUXIDIEN INDEX WATCHER
 * 
 * Calculates volume-weighted precious metals index and updates on-chain oracle.
 * Uses goldapi.io for real-time metal prices.
 * 
 * Index Methodology:
 * - Metals: Gold (XAU), Silver (XAG), Platinum (XPT), Palladium (XPD)
 * - Weighting: Based on notional USD trading volume
 * - Formula: AUXI = Σ(weight_i × price_i)
 */

// Oracle ABI (minimal)
const ORACLE_ABI = [
  "function setPricePerOzE6(uint256 newPricePerOzE6) external",
  "function setPriceWithMetals(uint256 newPricePerOzE6, uint256 goldPrice, uint256 silverPrice, uint256 platinumPrice, uint256 palladiumPrice) external",
  "function getPricePerOzE6() external view returns (uint256)",
  "function lastUpdateAt() external view returns (uint256)",
  "function minUpdateInterval() external view returns (uint256)",
  "event PriceUpdated(uint256 pricePerOzE6, uint256 timestamp, address indexed updater)"
];

// Metal data interface
interface MetalData {
  symbol: string;
  price: number;  // USD per oz
  volume: number; // Trading volume (normalized)
}

// goldapi.io response interface
interface GoldApiResponse {
  price: number;
  symbol: string;
  currency: string;
  timestamp: number;
  metal: string;
  price_gram_24k?: number;
  price_gram_22k?: number;
  price_gram_21k?: number;
  price_gram_18k?: number;
}

// Configuration
const CONFIG = {
  oracleAddress: process.env.AUXIDIEN_ORACLE_ADDRESS || "",
  rpcUrl: process.env.RPC_URL || "https://bsc-dataseed1.binance.org/",
  privateKey: process.env.PRIVATE_KEY || "",
  updateInterval: parseInt(process.env.WATCHER_INTERVAL || "300000"), // 5 minutes
  goldApiKey: process.env.GOLDAPI_KEY || "",
};

// Default volume weights (normalized market volumes)
const VOLUME_WEIGHTS = {
  XAU: 1_500_000,  // Gold - highest volume
  XAG: 800_000,    // Silver
  XPT: 200_000,    // Platinum
  XPD: 100_000,    // Palladium - lowest volume
};

/**
 * Fetch metal price from goldapi.io
 */
async function fetchMetalPrice(metal: string): Promise<number> {
  const url = `https://www.goldapi.io/api/${metal}/USD`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-access-token": CONFIG.goldApiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GoldAPI error for ${metal}: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as GoldApiResponse;
  return data.price;
}

/**
 * Fetch all spot metal prices from goldapi.io
 */
async function fetchSpotData(): Promise<MetalData[]> {
  console.log("📡 Fetching spot metal data from goldapi.io...");

  try {
    // Fetch all metals (with small delay between requests to avoid rate limiting)
    const goldPrice = await fetchMetalPrice("XAU");
    await sleep(500);
    
    const silverPrice = await fetchMetalPrice("XAG");
    await sleep(500);
    
    const platinumPrice = await fetchMetalPrice("XPT");
    await sleep(500);
    
    const palladiumPrice = await fetchMetalPrice("XPD");

    return [
      {
        symbol: "XAUUSD",
        price: goldPrice,
        volume: VOLUME_WEIGHTS.XAU,
      },
      {
        symbol: "XAGUSD",
        price: silverPrice,
        volume: VOLUME_WEIGHTS.XAG,
      },
      {
        symbol: "XPTUSD",
        price: platinumPrice,
        volume: VOLUME_WEIGHTS.XPT,
      },
      {
        symbol: "XPDUSD",
        price: palladiumPrice,
        volume: VOLUME_WEIGHTS.XPD,
      },
    ];
  } catch (error: any) {
    console.error("❌ Failed to fetch metal prices:", error.message);
    throw error;
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate volume-weighted AUXI index price
 */
function calculateIndex(metals: MetalData[]): {
  indexPrice: number;
  weights: Map<string, number>;
} {
  // Calculate notional USD for each metal
  const notionals: Map<string, number> = new Map();
  let totalNotional = 0;

  for (const metal of metals) {
    const notional = metal.price * metal.volume;
    notionals.set(metal.symbol, notional);
    totalNotional += notional;
  }

  if (totalNotional === 0) {
    throw new Error("Total notional is zero - cannot calculate weights");
  }

  // Calculate weights
  const weights: Map<string, number> = new Map();
  for (const [symbol, notional] of notionals) {
    weights.set(symbol, notional / totalNotional);
  }

  // Calculate weighted index price
  let indexPrice = 0;
  for (const metal of metals) {
    const weight = weights.get(metal.symbol) || 0;
    indexPrice += weight * metal.price;
  }

  return { indexPrice, weights };
}

/**
 * Update oracle with new index price
 */
async function updateOracle(
  oracle: ethers.Contract,
  indexPrice: number,
  metals: MetalData[]
): Promise<string | null> {
  try {
    // Convert prices to 1e6 format
    const indexPriceE6 = Math.round(indexPrice * 1e6);
    const goldPriceE6 = Math.round((metals.find(m => m.symbol === "XAUUSD")?.price || 0) * 1e6);
    const silverPriceE6 = Math.round((metals.find(m => m.symbol === "XAGUSD")?.price || 0) * 1e6);
    const platinumPriceE6 = Math.round((metals.find(m => m.symbol === "XPTUSD")?.price || 0) * 1e6);
    const palladiumPriceE6 = Math.round((metals.find(m => m.symbol === "XPDUSD")?.price || 0) * 1e6);

    console.log(`\n📤 Updating oracle...`);
    console.log(`   Index Price: $${indexPrice.toFixed(4)} (${indexPriceE6})`);

    // Use setPriceWithMetals to record individual prices for transparency
    const tx = await oracle.setPriceWithMetals(
      indexPriceE6,
      goldPriceE6,
      silverPriceE6,
      platinumPriceE6,
      palladiumPriceE6,
      { gasLimit: 200000 }
    );

    console.log(`   TX Hash: ${tx.hash}`);
    await tx.wait();
    console.log(`   ✅ Oracle updated successfully!`);

    return tx.hash;
  } catch (error: any) {
    console.error(`   ❌ Oracle update failed: ${error.message}`);
    
    // Check for specific errors
    if (error.message.includes("update too soon")) {
      console.log("   ⏰ Update interval not reached yet");
    } else if (error.message.includes("price change too large")) {
      console.log("   ⚠️ Price change exceeded maximum allowed rate");
    }
    
    return null;
  }
}

/**
 * Main watcher tick - fetch, calculate, update
 */
async function runTick(oracle: ethers.Contract): Promise<void> {
  console.log("\n" + "═".repeat(50));
  console.log(`⏰ Tick at ${new Date().toISOString()}`);

  try {
    // Fetch current metal data
    const metals = await fetchSpotData();

    // Log fetched prices
    console.log("\n📊 Metal Prices (from goldapi.io):");
    for (const metal of metals) {
      console.log(`   ${metal.symbol}: $${metal.price.toFixed(2)} | Vol: ${metal.volume.toLocaleString()}`);
    }

    // Calculate index
    const { indexPrice, weights } = calculateIndex(metals);

    console.log("\n📈 Index Calculation:");
    for (const [symbol, weight] of weights) {
      console.log(`   ${symbol}: ${(weight * 100).toFixed(2)}%`);
    }
    console.log(`   AUXI Index: $${indexPrice.toFixed(4)}`);

    // Update oracle
    await updateOracle(oracle, indexPrice, metals);

    // Read back current oracle value
    const currentPrice = await oracle.getPricePerOzE6();
    const lastUpdate = await oracle.lastUpdateAt();
    console.log(`\n📖 Oracle State:`);
    console.log(`   Current Price: ${Number(currentPrice) / 1e6} USD`);
    console.log(`   Last Update: ${new Date(Number(lastUpdate) * 1000).toISOString()}`);

  } catch (error: any) {
    console.error(`❌ Tick failed: ${error.message}`);
  }
}

/**
 * Start the watcher service
 */
async function startWatcher(): Promise<void> {
  console.log("🚀 Starting Auxidien Index Watcher\n");
  console.log("═".repeat(50));

  // Validate configuration
  if (!CONFIG.oracleAddress) {
    console.error("❌ AUXIDIEN_ORACLE_ADDRESS not set in .env");
    process.exit(1);
  }
  if (!CONFIG.privateKey) {
    console.error("❌ PRIVATE_KEY not set in .env");
    process.exit(1);
  }
  if (!CONFIG.goldApiKey) {
    console.error("❌ GOLDAPI_KEY not set in .env");
    process.exit(1);
  }

  console.log("⚙️  Configuration:");
  console.log(`   Oracle: ${CONFIG.oracleAddress}`);
  console.log(`   RPC: ${CONFIG.rpcUrl}`);
  console.log(`   Update Interval: ${CONFIG.updateInterval / 1000}s`);
  console.log(`   GoldAPI: ✅ Configured`);

  // Initialize provider and wallet
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  
  console.log(`   Watcher Address: ${wallet.address}`);

  // Check wallet balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`   Watcher Balance: ${ethers.formatEther(balance)} BNB`);

  if (balance === 0n) {
    console.warn("⚠️  Watcher wallet has no BNB - transactions will fail!");
  }

  // Initialize oracle contract
  const oracle = new ethers.Contract(CONFIG.oracleAddress, ORACLE_ABI, wallet);

  // Check oracle role
  try {
    const minInterval = await oracle.minUpdateInterval();
    console.log(`   Oracle Min Interval: ${minInterval}s`);
  } catch (error) {
    console.error("❌ Cannot read from oracle - check address and ORACLE_ROLE");
    process.exit(1);
  }

  console.log("\n✅ Watcher initialized successfully!");
  console.log("   Starting price update loop...\n");

  // Run initial tick
  await runTick(oracle);

  // Schedule periodic updates
  setInterval(() => runTick(oracle), CONFIG.updateInterval);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down watcher...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\n👋 Shutting down watcher...");
  process.exit(0);
});

// Run
startWatcher().catch((error) => {
  console.error("❌ Watcher startup failed:", error);
  process.exit(1);
});
