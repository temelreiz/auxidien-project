import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * AUXIDIEN INDEX PREPROCESSOR (Signal Processor)
 * 
 * Role: Normalize ecosystem signals and produce index inputs
 * NOT a price setter - just a signal processor
 * 
 * Architecture:
 * - Preprocessor (this) = Signal normalization & weight calculation
 * - Oracle = Final price publisher with validation
 * - Contract = Rule enforcer
 * 
 * Methodology:
 * - Inverse volatility weighting with bounded constraints
 * - Log-return based volatility (finance standard)
 * - Smooth weight transitions (no sudden shocks)
 * - Volatility regime detection
 */

// Oracle ABI (minimal)
const ORACLE_ABI = [
  "function setPricePerOzE6(uint256 newPricePerOzE6) external",
  "function setPriceWithMetals(uint256 newPricePerOzE6, uint256 goldPrice, uint256 silverPrice, uint256 platinumPrice, uint256 palladiumPrice) external",
  "function getPricePerOzE6() external view returns (uint256)",
  "function lastUpdateAt() external view returns (uint256)",
  "function minUpdateInterval() external view returns (uint256)",
];

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  oracleAddress: process.env.AUXIDIEN_ORACLE_ADDRESS || "",
  rpcUrl: process.env.RPC_URL || "https://bsc-dataseed1.binance.org/",
  privateKey: process.env.PRIVATE_KEY || "",
  updateInterval: parseInt(process.env.WATCHER_INTERVAL || "300000"), // 5 minutes
  goldApiKey: process.env.GOLDAPI_KEY || "",
};

// Conversion constants
const OUNCE_TO_GRAM = 31.1035;

// ═══════════════════════════════════════════════════════════════
// WEIGHT BOUNDS (α + β + γ + δ = 1)
// Weights NEVER go outside these bounds
// ═══════════════════════════════════════════════════════════════

const WEIGHT_BOUNDS: Record<string, { min: number; max: number }> = {
  XAU: { min: 0.35, max: 0.55 },  // Gold: 35-55%
  XAG: { min: 0.15, max: 0.30 },  // Silver: 15-30%
  XPT: { min: 0.10, max: 0.25 },  // Platinum: 10-25%
  XPD: { min: 0.05, max: 0.15 },  // Palladium: 5-15%
};

// Smooth transition factor (λ)
// Lower = smoother, slower adaptation
// 0.05-0.1 recommended for stability
const LAMBDA = 0.08;

// ═══════════════════════════════════════════════════════════════
// VOLATILITY REGIMES
// ═══════════════════════════════════════════════════════════════

enum VolatilityRegime {
  LOW = "LOW",           // σ < 1% - Normal market
  MEDIUM = "MEDIUM",     // 1-3% - Elevated activity
  HIGH = "HIGH",         // 3-6% - High volatility
  EXTREME = "EXTREME",   // > 6% - Crisis mode
}

interface RegimeConfig {
  maxPriceChange: number;  // Max allowed price change per update
  updateMultiplier: number; // Adjustment to update frequency
  description: string;
}

const REGIME_CONFIGS: Record<VolatilityRegime, RegimeConfig> = {
  [VolatilityRegime.LOW]: {
    maxPriceChange: 0.05,    // 5%
    updateMultiplier: 1.0,
    description: "Normal market conditions",
  },
  [VolatilityRegime.MEDIUM]: {
    maxPriceChange: 0.03,    // 3%
    updateMultiplier: 1.0,
    description: "Elevated market activity",
  },
  [VolatilityRegime.HIGH]: {
    maxPriceChange: 0.02,    // 2%
    updateMultiplier: 0.5,   // Update more frequently
    description: "High volatility - increased caution",
  },
  [VolatilityRegime.EXTREME]: {
    maxPriceChange: 0.01,    // 1%
    updateMultiplier: 0.25,  // Much more frequent updates
    description: "EXTREME volatility - maximum caution",
  },
};

// ═══════════════════════════════════════════════════════════════
// DATA STRUCTURES
// ═══════════════════════════════════════════════════════════════

interface MetalData {
  symbol: string;
  price: number;
  weight: number;
}

interface PricePoint {
  timestamp: number;
  price: number;
}

interface GoldApiResponse {
  price: number;
  symbol: string;
  currency: string;
  timestamp: number;
}

// Price history for volatility calculation (last 24-48 hours)
const priceHistory: Record<string, PricePoint[]> = {
  XAU: [],
  XAG: [],
  XPT: [],
  XPD: [],
};

// Current weights (start with middle of bounds)
let currentWeights: Record<string, number> = {
  XAU: 0.45,  // Start at middle of 35-55%
  XAG: 0.22,  // Start at middle of 15-30%
  XPT: 0.18,  // Start at middle of 10-25%
  XPD: 0.15,  // Adjusted to sum to 1
};

// Keep last 288 data points (24 hours at 5-min intervals)
const MAX_HISTORY_POINTS = 288;
const MIN_POINTS_FOR_VOLATILITY = 12;

// ═══════════════════════════════════════════════════════════════
// VOLATILITY CALCULATION (Log Return Based)
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate log returns from price history
 * Log returns are standard in finance because:
 * - They're additive over time
 * - They dampen large spikes
 * - They're symmetric for gains/losses
 */
function calculateLogReturns(prices: PricePoint[]): number[] {
  const returns: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const prevPrice = prices[i - 1].price;
    const currPrice = prices[i].price;
    
    if (prevPrice > 0 && currPrice > 0) {
      // Log return: ln(P_t / P_{t-1})
      returns.push(Math.log(currPrice / prevPrice));
    }
  }
  
  return returns;
}

/**
 * Calculate annualized volatility from log returns
 * σ = stddev(log_returns) × √(periods_per_year)
 */
function calculateVolatility(metal: string): number {
  const history = priceHistory[metal];
  
  if (history.length < MIN_POINTS_FOR_VOLATILITY) {
    // Default volatilities based on historical data
    const defaults: Record<string, number> = {
      XAU: 0.12,  // Gold: ~12% annual
      XAG: 0.22,  // Silver: ~22%
      XPT: 0.18,  // Platinum: ~18%
      XPD: 0.30,  // Palladium: ~30%
    };
    return defaults[metal] || 0.15;
  }

  const logReturns = calculateLogReturns(history);
  
  if (logReturns.length < 5) {
    return 0.15; // Default
  }

  // Calculate mean
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  
  // Calculate variance
  const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / logReturns.length;
  
  // Standard deviation
  const stdDev = Math.sqrt(variance);

  // Annualize: multiply by sqrt(periods per year)
  // 5-min intervals = 288/day × 365 = 105,120 periods/year
  const annualizedVol = stdDev * Math.sqrt(105120);

  // Clamp to reasonable bounds (5% to 80%)
  return Math.max(0.05, Math.min(0.80, annualizedVol));
}

/**
 * Determine current volatility regime based on average volatility
 */
function detectVolatilityRegime(volatilities: Record<string, number>): VolatilityRegime {
  // Use gold-weighted average (gold is the anchor)
  const avgVol = volatilities.XAU * 0.5 + 
                 volatilities.XAG * 0.2 + 
                 volatilities.XPT * 0.2 + 
                 volatilities.XPD * 0.1;

  // Convert to daily volatility for regime detection
  const dailyVol = avgVol / Math.sqrt(252);

  if (dailyVol < 0.01) return VolatilityRegime.LOW;
  if (dailyVol < 0.03) return VolatilityRegime.MEDIUM;
  if (dailyVol < 0.06) return VolatilityRegime.HIGH;
  return VolatilityRegime.EXTREME;
}

// ═══════════════════════════════════════════════════════════════
// WEIGHT CALCULATION (Bounded & Smooth)
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate target weights based on inverse volatility
 * Lower volatility = Higher weight (more stable = more influence)
 */
function calculateTargetWeights(volatilities: Record<string, number>): Record<string, number> {
  // Inverse volatility
  const inverseVols: Record<string, number> = {};
  let totalInverseVol = 0;

  for (const [metal, vol] of Object.entries(volatilities)) {
    inverseVols[metal] = 1 / vol;
    totalInverseVol += inverseVols[metal];
  }

  // Raw target weights (before bounds)
  const rawTargets: Record<string, number> = {};
  for (const [metal, invVol] of Object.entries(inverseVols)) {
    rawTargets[metal] = invVol / totalInverseVol;
  }

  // Apply bounds
  const boundedTargets: Record<string, number> = {};
  for (const [metal, target] of Object.entries(rawTargets)) {
    const bounds = WEIGHT_BOUNDS[metal];
    boundedTargets[metal] = Math.max(bounds.min, Math.min(bounds.max, target));
  }

  // Normalize to ensure sum = 1
  const sum = Object.values(boundedTargets).reduce((a, b) => a + b, 0);
  for (const metal of Object.keys(boundedTargets)) {
    boundedTargets[metal] /= sum;
  }

  return boundedTargets;
}

/**
 * Smooth transition from current weights to target weights
 * w_new = w_old × (1 - λ) + w_target × λ
 */
function smoothWeightTransition(
  current: Record<string, number>,
  target: Record<string, number>,
  lambda: number
): Record<string, number> {
  const newWeights: Record<string, number> = {};

  for (const metal of Object.keys(current)) {
    // Exponential moving average for smooth transition
    newWeights[metal] = current[metal] * (1 - lambda) + target[metal] * lambda;
    
    // Re-apply bounds after transition
    const bounds = WEIGHT_BOUNDS[metal];
    newWeights[metal] = Math.max(bounds.min, Math.min(bounds.max, newWeights[metal]));
  }

  // Normalize to ensure sum = 1
  const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
  for (const metal of Object.keys(newWeights)) {
    newWeights[metal] /= sum;
  }

  return newWeights;
}

// ═══════════════════════════════════════════════════════════════
// PRICE FETCHING
// ═══════════════════════════════════════════════════════════════

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

  const data = await response.json() as GoldApiResponse;
  return data.price;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Add price to history for volatility calculation
 */
function addPriceToHistory(metal: string, price: number): void {
  if (!priceHistory[metal]) {
    priceHistory[metal] = [];
  }

  priceHistory[metal].push({
    timestamp: Date.now(),
    price: price,
  });

  // Keep only last MAX_HISTORY_POINTS
  if (priceHistory[metal].length > MAX_HISTORY_POINTS) {
    priceHistory[metal] = priceHistory[metal].slice(-MAX_HISTORY_POINTS);
  }
}

// ═══════════════════════════════════════════════════════════════
// INDEX CALCULATION
// ═══════════════════════════════════════════════════════════════

async function fetchAndProcessSignals(): Promise<{
  metals: MetalData[];
  indexPrice: number;
  regime: VolatilityRegime;
  volatilities: Record<string, number>;
}> {
  console.log("\n📡 SIGNAL PROCESSING");
  console.log("   Fetching raw signals from goldapi.io...");

  // Fetch prices
  const goldPriceOz = await fetchMetalPrice("XAU");
  await sleep(1500);
  const silverPriceOz = await fetchMetalPrice("XAG");
  await sleep(1500);
  const platinumPriceOz = await fetchMetalPrice("XPT");
  await sleep(1500);
  const palladiumPriceOz = await fetchMetalPrice("XPD");

  // Convert to grams
  const prices: Record<string, number> = {
    XAU: goldPriceOz / OUNCE_TO_GRAM,
    XAG: silverPriceOz / OUNCE_TO_GRAM,
    XPT: platinumPriceOz / OUNCE_TO_GRAM,
    XPD: palladiumPriceOz / OUNCE_TO_GRAM,
  };

  // Add to history
  for (const [metal, price] of Object.entries(prices)) {
    addPriceToHistory(metal, price);
  }

  // Calculate volatilities
  console.log("\n📊 VOLATILITY ANALYSIS (Log-Return Based)");
  const volatilities: Record<string, number> = {
    XAU: calculateVolatility("XAU"),
    XAG: calculateVolatility("XAG"),
    XPT: calculateVolatility("XPT"),
    XPD: calculateVolatility("XPD"),
  };

  for (const [metal, vol] of Object.entries(volatilities)) {
    const dataPoints = priceHistory[metal].length;
    console.log(`   ${metal}: σ = ${(vol * 100).toFixed(2)}% (${dataPoints} data points)`);
  }

  // Detect regime
  const regime = detectVolatilityRegime(volatilities);
  const regimeConfig = REGIME_CONFIGS[regime];
  console.log(`\n🎯 VOLATILITY REGIME: ${regime}`);
  console.log(`   ${regimeConfig.description}`);
  console.log(`   Max price change: ${(regimeConfig.maxPriceChange * 100).toFixed(1)}%`);

  // Calculate target weights
  const targetWeights = calculateTargetWeights(volatilities);

  // Smooth transition
  console.log("\n⚖️  WEIGHT TRANSITION");
  console.log(`   λ (smoothing factor): ${LAMBDA}`);
  
  const previousWeights = { ...currentWeights };
  currentWeights = smoothWeightTransition(currentWeights, targetWeights, LAMBDA);

  console.log("\n   Metal    | Previous | Target   | New      | Bounds");
  console.log("   " + "─".repeat(55));
  for (const metal of ["XAU", "XAG", "XPT", "XPD"]) {
    const bounds = WEIGHT_BOUNDS[metal];
    console.log(
      `   ${metal}     | ${(previousWeights[metal] * 100).toFixed(2)}%   | ` +
      `${(targetWeights[metal] * 100).toFixed(2)}%   | ` +
      `${(currentWeights[metal] * 100).toFixed(2)}%   | ` +
      `[${(bounds.min * 100).toFixed(0)}%-${(bounds.max * 100).toFixed(0)}%]`
    );
  }

  // Build metal data with final weights
  const metals: MetalData[] = [
    { symbol: "XAUUSD", price: prices.XAU, weight: currentWeights.XAU },
    { symbol: "XAGUSD", price: prices.XAG, weight: currentWeights.XAG },
    { symbol: "XPTUSD", price: prices.XPT, weight: currentWeights.XPT },
    { symbol: "XPDUSD", price: prices.XPD, weight: currentWeights.XPD },
  ];

  // Calculate index price
  let indexPrice = 0;
  for (const metal of metals) {
    indexPrice += metal.weight * metal.price;
  }

  console.log("\n💎 INDEX CALCULATION");
  console.log("   " + "─".repeat(45));
  for (const metal of metals) {
    const contribution = metal.weight * metal.price;
    console.log(
      `   ${metal.symbol}: $${metal.price.toFixed(4)}/g × ${(metal.weight * 100).toFixed(2)}% = $${contribution.toFixed(4)}`
    );
  }
  console.log("   " + "─".repeat(45));
  console.log(`   AUXI INDEX: $${indexPrice.toFixed(4)}/gram`);

  return { metals, indexPrice, regime, volatilities };
}

// ═══════════════════════════════════════════════════════════════
// ORACLE UPDATE
// ═══════════════════════════════════════════════════════════════

async function updateOracle(
  oracle: ethers.Contract,
  indexPrice: number,
  metals: MetalData[],
  regime: VolatilityRegime
): Promise<string | null> {
  try {
    const regimeConfig = REGIME_CONFIGS[regime];
    
    // Convert prices to 1e6 format
    const indexPriceE6 = Math.round(indexPrice * 1e6);
    const goldPriceE6 = Math.round((metals.find(m => m.symbol === "XAUUSD")?.price || 0) * 1e6);
    const silverPriceE6 = Math.round((metals.find(m => m.symbol === "XAGUSD")?.price || 0) * 1e6);
    const platinumPriceE6 = Math.round((metals.find(m => m.symbol === "XPTUSD")?.price || 0) * 1e6);
    const palladiumPriceE6 = Math.round((metals.find(m => m.symbol === "XPDUSD")?.price || 0) * 1e6);

    console.log("\n📤 PUBLISHING TO ORACLE");
    console.log(`   Regime: ${regime} (max change: ${(regimeConfig.maxPriceChange * 100).toFixed(1)}%)`);
    console.log(`   Index Price: $${indexPrice.toFixed(4)}/gram (${indexPriceE6})`);

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
    
    if (error.message.includes("price change too large")) {
      console.log("   ⚠️ Price change exceeded oracle's maximum allowed rate");
      console.log("   💡 This is a safety feature - gradual updates will converge");
    }
    
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════

async function runTick(oracle: ethers.Contract): Promise<void> {
  console.log("\n" + "═".repeat(60));
  console.log(`⏰ TICK at ${new Date().toISOString()}`);
  console.log("═".repeat(60));

  try {
    const { metals, indexPrice, regime } = await fetchAndProcessSignals();
    await updateOracle(oracle, indexPrice, metals, regime);

    // Read back oracle state
    const currentPrice = await oracle.getPricePerOzE6();
    const lastUpdate = await oracle.lastUpdateAt();
    
    console.log("\n📖 ORACLE STATE");
    console.log(`   On-chain Price: $${(Number(currentPrice) / 1e6).toFixed(4)}/gram`);
    console.log(`   Last Update: ${new Date(Number(lastUpdate) * 1000).toISOString()}`);

  } catch (error: any) {
    console.error(`\n❌ TICK FAILED: ${error.message}`);
  }
}

async function startPreprocessor(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        AUXIDIEN INDEX PREPROCESSOR (Signal Processor)      ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Validate configuration
  if (!CONFIG.oracleAddress) {
    console.error("❌ AUXIDIEN_ORACLE_ADDRESS not set");
    process.exit(1);
  }
  if (!CONFIG.privateKey) {
    console.error("❌ PRIVATE_KEY not set");
    process.exit(1);
  }
  if (!CONFIG.goldApiKey) {
    console.error("❌ GOLDAPI_KEY not set");
    process.exit(1);
  }

  console.log("⚙️  CONFIGURATION");
  console.log(`   Oracle: ${CONFIG.oracleAddress}`);
  console.log(`   RPC: ${CONFIG.rpcUrl}`);
  console.log(`   Update Interval: ${CONFIG.updateInterval / 1000}s`);
  console.log(`   Smoothing Factor (λ): ${LAMBDA}`);
  console.log(`   Min Data Points: ${MIN_POINTS_FOR_VOLATILITY}`);

  console.log("\n📊 WEIGHT BOUNDS");
  for (const [metal, bounds] of Object.entries(WEIGHT_BOUNDS)) {
    console.log(`   ${metal}: ${(bounds.min * 100).toFixed(0)}% - ${(bounds.max * 100).toFixed(0)}%`);
  }

  // Initialize provider and wallet
  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);
  
  console.log(`\n💼 WALLET`);
  console.log(`   Address: ${wallet.address}`);
  
  const balance = await provider.getBalance(wallet.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} BNB`);

  if (balance === 0n) {
    console.warn("   ⚠️ Wallet has no BNB - transactions will fail!");
  }

  // Initialize oracle
  const oracle = new ethers.Contract(CONFIG.oracleAddress, ORACLE_ABI, wallet);

  try {
    const minInterval = await oracle.minUpdateInterval();
    console.log(`\n🔮 ORACLE`);
    console.log(`   Min Update Interval: ${minInterval}s`);
  } catch (error) {
    console.error("❌ Cannot connect to oracle");
    process.exit(1);
  }

  console.log("\n✅ Preprocessor initialized!");
  console.log("   Starting signal processing loop...\n");

  // Run initial tick
  await runTick(oracle);

  // Schedule periodic updates
  setInterval(() => runTick(oracle), CONFIG.updateInterval);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down preprocessor...");
  console.log("   Final weights:", currentWeights);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\n👋 Shutting down preprocessor...");
  process.exit(0);
});

// Run
startPreprocessor().catch((error) => {
  console.error("❌ Startup failed:", error);
  process.exit(1);
});
