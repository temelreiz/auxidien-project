import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type MetalSymbol = "XAU" | "XAG" | "XPT" | "XPD";

interface GoldApiResponse {
  timestamp: number | string;
  metal?: string;
  currency?: string;
  exchange?: string;
  symbol: string;
  prev_close_price?: number;
  open_price?: number;
  low_price?: number;
  high_price?: number;
  open_time?: number;
  price: number;
  ch?: number;
  chp?: number;
  ask?: number;
  bid?: number;
}

interface OracleContract extends ethers.BaseContract {
  updateIndexPrice: (price: bigint) => Promise<any>;
  getIndexPrice: () => Promise<bigint>;
}

type Weights = Record<MetalSymbol, number>;

type RawSignals = Record<
  MetalSymbol,
  {
    priceUsdPerOz: number;
    priceUsdPerG: number;
  }
>;

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  rpcUrl: process.env.RPC_URL || "",
  oracleAddress: process.env.ORACLE_ADDRESS || "",
  privateKey: process.env.PRIVATE_KEY || "",
  updateInterval: parseInt(process.env.WATCHER_INTERVAL || "300000"), // default 5 minutes
  goldApiKey: process.env.GOLDAPI_KEY || "",

  // Optional discovery phase publishing windows (UTC)
  publishHours: [0, 5, 10, 15, 20],
  discoveryPhase: false,
};

// Conversion constants
const OUNCE_TO_GRAM = 31.1035;

// ═══════════════════════════════════════════════════════════════
// WEIGHT BOUNDS (α + β + γ + δ = 1)
// ═══════════════════════════════════════════════════════════════

const WEIGHT_BOUNDS: Record<MetalSymbol, { min: number; max: number }> = {
  XAU: { min: 0.45, max: 0.65 }, // Gold: 45-65%
  XAG: { min: 0.15, max: 0.30 }, // Silver: 15-30%
  XPT: { min: 0.10, max: 0.25 }, // Platinum: 10-25%
  XPD: { min: 0.05, max: 0.15 }, // Palladium: 5-15%
};

// Smooth transition factor (λ)
const LAMBDA = 0.08;

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

let currentWeights: Weights = {
  XAU: 0.55,
  XAG: 0.20,
  XPT: 0.17,
  XPD: 0.08,
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function nowISO() {
  return new Date().toISOString();
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function normalizeWeights(w: Weights): Weights {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return {
    XAU: w.XAU / sum,
    XAG: w.XAG / sum,
    XPT: w.XPT / sum,
    XPD: w.XPD / sum,
  };
}

// ═══════════════════════════════════════════════════════════════
// PRICE FETCHING (RATE LIMITED + CACHED + 429 BACKOFF)
// ═══════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

/**
 * In-memory cache + rate limiting for GoldAPI.
 * GoldAPI enforces ~5 requests / second per API key.
 * - We serialize requests with a minimum spacing
 * - We cache responses briefly to avoid refetching within the same tick/window
 */
type CachedPrice = { ts: number; value: number };
const PRICE_CACHE = new Map<string, CachedPrice>();

// Default 3s cache (you can raise to 30-60s safely if needed)
const PRICE_CACHE_TTL_MS = parseInt(process.env.GOLDAPI_CACHE_TTL_MS || "3000");

// Ensure we never exceed ~4 req/s (safe under 5 req/s), even if something spikes.
const GOLDAPI_MIN_SPACING_MS = parseInt(process.env.GOLDAPI_MIN_SPACING_MS || "300");

// Promise chain used as a simple mutex/queue for GoldAPI calls
let goldApiQueue: Promise<void> = Promise.resolve();
let lastGoldApiCallAt = 0;

async function scheduleGoldApiCall<T>(fn: () => Promise<T>): Promise<T> {
  let resolvePrev!: () => void;
  const prev = goldApiQueue;
  goldApiQueue = new Promise<void>((r) => (resolvePrev = r));

  await prev;
  try {
    const now = Date.now();
    const since = now - lastGoldApiCallAt;
    const wait = Math.max(0, GOLDAPI_MIN_SPACING_MS - since) + jitter(0, 120);
    if (wait > 0) await sleep(wait);
    const result = await fn();
    lastGoldApiCallAt = Date.now();
    return result;
  } finally {
    resolvePrev();
  }
}

async function fetchMetalPrice(metal: MetalSymbol, retries = 3): Promise<number> {
  // Cache first (helps when ticks fire close together or code calls twice)
  const cached = PRICE_CACHE.get(metal);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL_MS) {
    return cached.value;
  }

  const url = `https://www.goldapi.io/api/${metal}/USD`;

  // Serialize + rate-limit all GoldAPI calls through the queue
  const price = await scheduleGoldApiCall(async () => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "x-access-token": CONFIG.goldApiKey,
            "Content-Type": "application/json",
          },
        });

        if (response.status === 429) {
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;

          const waitTime =
            (Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : attempt * 4000) +
            jitter(0, 500);

          const errorText = await response.text().catch(() => "");
          console.log(
            `   ⚠️ GoldAPI 429 on ${metal}. Waiting ${(waitTime / 1000).toFixed(
              1
            )}s (attempt ${attempt}/${retries}). ${errorText ? "Body: " + errorText : ""}`
          );

          await sleep(waitTime);
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`GoldAPI error for ${metal}: ${response.status} - ${errorText}`);
        }

        const data = (await response.json()) as GoldApiResponse;
        if (typeof data?.price !== "number") {
          throw new Error(`GoldAPI unexpected payload for ${metal}: ${JSON.stringify(data)}`);
        }

        return data.price;
      } catch (error: any) {
        if (attempt === retries) throw error;

        console.log(
          `   ⚠️ Attempt ${attempt} failed for ${metal}, retrying... (${String(
            error?.message || error
          )})`
        );

        await sleep(1500 + attempt * 1000 + jitter(0, 400));
      }
    }

    throw new Error(`Failed to fetch ${metal} after ${retries} attempts`);
  });

  PRICE_CACHE.set(metal, { ts: Date.now(), value: price });
  return price;
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL PROCESSING (YOUR EXISTING LOGIC)
// ═══════════════════════════════════════════════════════════════

function shouldPublishNowUTC(): boolean {
  if (!CONFIG.discoveryPhase) return true;
  const hour = new Date().getUTCHours();
  return CONFIG.publishHours.includes(hour);
}

async function fetchRawSignals(): Promise<RawSignals> {
  console.log("══════════════════════════════════════════════════");
  console.log(`⏰ Tick at ${nowISO()}`);
  console.log("📡 Fetching raw signals from goldapi.io...");

  // IMPORTANT: Calls are queued & rate-limited inside fetchMetalPrice.
  const goldPriceOz = await fetchMetalPrice("XAU");
  const silverPriceOz = await fetchMetalPrice("XAG");
  const platinumPriceOz = await fetchMetalPrice("XPT");
  const palladiumPriceOz = await fetchMetalPrice("XPD");

  const prices: RawSignals = {
    XAU: { priceUsdPerOz: goldPriceOz, priceUsdPerG: goldPriceOz / OUNCE_TO_GRAM },
    XAG: { priceUsdPerOz: silverPriceOz, priceUsdPerG: silverPriceOz / OUNCE_TO_GRAM },
    XPT: { priceUsdPerOz: platinumPriceOz, priceUsdPerG: platinumPriceOz / OUNCE_TO_GRAM },
    XPD: { priceUsdPerOz: palladiumPriceOz, priceUsdPerG: palladiumPriceOz / OUNCE_TO_GRAM },
  };

  console.log("✅ Raw prices fetched (USD/oz):", {
    XAU: goldPriceOz,
    XAG: silverPriceOz,
    XPT: platinumPriceOz,
    XPD: palladiumPriceOz,
  });

  return prices;
}

// NOTE: Below functions are assumed to be your original logic.
// If you already have these implemented in the file, keep them.
// I’m leaving placeholders minimal but compatible with your structure.

function computeIndexPrice(prices: RawSignals, weights: Weights): number {
  // Example: weighted sum in USD/gram (replace with your exact formula if different)
  const x =
    prices.XAU.priceUsdPerG * weights.XAU +
    prices.XAG.priceUsdPerG * weights.XAG +
    prices.XPT.priceUsdPerG * weights.XPT +
    prices.XPD.priceUsdPerG * weights.XPD;
  return x;
}

function smoothWeights(prev: Weights, next: Weights): Weights {
  const w: Weights = {
    XAU: prev.XAU + LAMBDA * (next.XAU - prev.XAU),
    XAG: prev.XAG + LAMBDA * (next.XAG - prev.XAG),
    XPT: prev.XPT + LAMBDA * (next.XPT - prev.XPT),
    XPD: prev.XPD + LAMBDA * (next.XPD - prev.XPD),
  };

  // Enforce bounds + normalize
  w.XAU = clamp(w.XAU, WEIGHT_BOUNDS.XAU.min, WEIGHT_BOUNDS.XAU.max);
  w.XAG = clamp(w.XAG, WEIGHT_BOUNDS.XAG.min, WEIGHT_BOUNDS.XAG.max);
  w.XPT = clamp(w.XPT, WEIGHT_BOUNDS.XPT.min, WEIGHT_BOUNDS.XPT.max);
  w.XPD = clamp(w.XPD, WEIGHT_BOUNDS.XPD.min, WEIGHT_BOUNDS.XPD.max);

  return normalizeWeights(w);
}

function deriveNewWeights(_prices: RawSignals, prev: Weights): Weights {
  // Keep your existing logic here.
  // As a safe default, keep weights stable.
  return { ...prev };
}

async function publishToOracle(oracle: OracleContract, indexPriceUsdPerG: number) {
  // Convert to 18 decimals (example)
  const scaled = ethers.parseUnits(indexPriceUsdPerG.toFixed(8), 18);
  console.log(`🧾 Publishing index price: ${indexPriceUsdPerG} USD/g -> ${scaled.toString()}`);

  const tx = await oracle.updateIndexPrice(scaled);
  console.log(`⛓️  Sent tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`✅ Published. Block: ${receipt.blockNumber}`);
}

async function runTick(oracle: OracleContract) {
  try {
    const raw = await fetchRawSignals();

    const newWeights = deriveNewWeights(raw, currentWeights);
    currentWeights = smoothWeights(currentWeights, newWeights);

    const index = computeIndexPrice(raw, currentWeights);

    console.log("⚖️ Current weights:", currentWeights);
    console.log(`📈 Computed index: ${index} USD/g`);

    if (!shouldPublishNowUTC()) {
      console.log("🕰️ Discovery phase: Not publishing at this hour.");
      return;
    }

    await publishToOracle(oracle, index);
  } catch (e: any) {
    console.error("❌ Tick failed:", e?.message || e);
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════

async function startPreprocessor() {
  if (!CONFIG.rpcUrl || !CONFIG.oracleAddress || !CONFIG.privateKey || !CONFIG.goldApiKey) {
    console.error("❌ Missing env vars. Need RPC_URL, ORACLE_ADDRESS, PRIVATE_KEY, GOLDAPI_KEY");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(CONFIG.privateKey, provider);

  const oracleAbi = [
    "function updateIndexPrice(uint256 price) external",
    "function getIndexPrice() external view returns (uint256)",
  ];

  const oracle = new ethers.Contract(CONFIG.oracleAddress, oracleAbi, wallet) as unknown as OracleContract;

  console.log("\n✅ Watcher initialized successfully!");
  console.log("   Starting price update loop...\n");

  // Run initial tick
  await runTick(oracle);

  // Schedule periodic updates (non-overlapping loop)
  let isTickRunning = false;
  setInterval(async () => {
    if (isTickRunning) {
      console.log("⏳ Previous tick still running — skipping this interval.");
      return;
    }
    isTickRunning = true;
    try {
      await runTick(oracle);
    } catch {
      // runTick already logs
    } finally {
      isTickRunning = false;
    }
  }, CONFIG.updateInterval);
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n👋 Shutting down watcher...");
  console.log("   Final weights:", currentWeights);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\n👋 Shutting down watcher...");
  process.exit(0);
});

// Run
startPreprocessor().catch((error) => {
  console.error("❌ Startup failed:", error);
  process.exit(1);
});
