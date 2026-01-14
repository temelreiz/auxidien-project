import { ethers } from "ethers";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

/* ═══════════════════════════════════════════════
   ENV CHECK
═══════════════════════════════════════════════ */
const REQUIRED_ENVS = ["RPC_URL", "ORACLE_ADDRESS", "PRIVATE_KEY", "GOLDAPI_KEY"];
for (const k of REQUIRED_ENVS) {
  if (!process.env[k]) {
    console.error(`❌ Missing env var: ${k}`);
    process.exit(1);
  }
}

/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const RPC_URL = process.env.RPC_URL!;
const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS!;
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const GOLDAPI_KEY = process.env.GOLDAPI_KEY!;

const WATCHER_INTERVAL = parseInt(process.env.WATCHER_INTERVAL || "300000", 10); // 5 min
const GOLDAPI_MIN_SPACING_MS = parseInt(process.env.GOLDAPI_MIN_SPACING_MS || "1000", 10);
const GOLDAPI_CACHE_TTL_MS = parseInt(process.env.GOLDAPI_CACHE_TTL_MS || "30000", 10);
const ORACLE_MAX_STEP_BPS = parseInt(process.env.ORACLE_MAX_STEP_BPS || "300", 10); // %3

const OUNCE_TO_GRAM = 31.1035;

/* ═══════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════ */
type MetalSymbol = "XAU" | "XAG" | "XPT" | "XPD";

interface RawSignals {
  XAU: { priceUsdPerG: number };
  XAG: { priceUsdPerG: number };
  XPT: { priceUsdPerG: number };
  XPD: { priceUsdPerG: number };
}

type Weights = Record<MetalSymbol, number>;

interface OracleContract extends ethers.BaseContract {
  setPricePerOzE6: (newPricePerOzE6: bigint) => Promise<any>;
  getPricePerOzE6: () => Promise<bigint>;
}

/* ═══════════════════════════════════════════════
   WEIGHTS
═══════════════════════════════════════════════ */
const CURRENT_WEIGHTS: Weights = {
  XAU: 0.55,
  XAG: 0.20,
  XPT: 0.17,
  XPD: 0.08,
};

/* ═══════════════════════════════════════════════
   GOLDAPI FETCH (RATE-LIMIT SAFE)
═══════════════════════════════════════════════ */
let lastFetchAt = 0;
let cachedData: RawSignals | null = null;

async function fetchMetal(symbol: MetalSymbol): Promise<number> {
  const res = await fetch(`https://www.goldapi.io/api/${symbol}/USD`, {
    headers: {
      "x-access-token": GOLDAPI_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GoldAPI ${symbol} ${res.status}: ${txt}`);
  }

  const json: any = await res.json();
  return json.price / OUNCE_TO_GRAM; // USD/g
}

async function fetchRawSignals(): Promise<RawSignals> {
  const now = Date.now();
  if (cachedData && now - lastFetchAt < GOLDAPI_CACHE_TTL_MS) return cachedData;

  const wait = Math.max(0, GOLDAPI_MIN_SPACING_MS - (now - lastFetchAt));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));

  const data: RawSignals = {
    XAU: { priceUsdPerG: await fetchMetal("XAU") },
    XAG: { priceUsdPerG: await fetchMetal("XAG") },
    XPT: { priceUsdPerG: await fetchMetal("XPT") },
    XPD: { priceUsdPerG: await fetchMetal("XPD") },
  };

  cachedData = data;
  lastFetchAt = Date.now();
  return data;
}

/* ═══════════════════════════════════════════════
   INDEX CALCULATION (USD / gram)
═══════════════════════════════════════════════ */
function computeIndexPrice(prices: RawSignals, weights: Weights): number {
  return (
    prices.XAU.priceUsdPerG * weights.XAU +
    prices.XAG.priceUsdPerG * weights.XAG +
    prices.XPT.priceUsdPerG * weights.XPT +
    prices.XPD.priceUsdPerG * weights.XPD
  );
}

/* ═══════════════════════════════════════════════
   ORACLE STEP LOGIC
═══════════════════════════════════════════════ */
function stepLimitedE6(current: bigint, target: bigint, maxStepBps: number): bigint {
  if (current === target) return target;
  if (current === 0n) return target;

  const diff = target - current;
  const absDiff = diff >= 0n ? diff : -diff;

  let maxStep = (current * BigInt(maxStepBps)) / 10_000n;
  if (maxStep <= 0n) maxStep = 1n;

  if (absDiff <= maxStep) return target;
  return diff > 0n ? current + maxStep : current - maxStep;
}

async function publishToOracle(oracle: OracleContract, indexUsdPerG: number) {
  const targetUsdPerOz = indexUsdPerG * OUNCE_TO_GRAM;
  const targetE6 = BigInt(Math.round(targetUsdPerOz * 1_000_000));

  const currentE6 = await oracle.getPricePerOzE6();
  const nextE6 = stepLimitedE6(currentE6, targetE6, ORACLE_MAX_STEP_BPS);

  console.log(
    `🧾 Oracle publish | current=${currentE6} target=${targetE6} next=${nextE6} step=${ORACLE_MAX_STEP_BPS}bps`
  );

  const tx = await oracle.setPricePerOzE6(nextE6);
  await tx.wait();
}

/* ═══════════════════════════════════════════════
   MAIN LOOP
═══════════════════════════════════════════════ */
async function run() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const oracle = new ethers.Contract(
    ORACLE_ADDRESS,
    [
      "function setPricePerOzE6(uint256 newPricePerOzE6) external",
      "function getPricePerOzE6() external view returns (uint256)",
    ],
    wallet
  ) as OracleContract;

  console.log("✅ Watcher initialized successfully!");
  console.log("   Starting price update loop...");
  console.log("══════════════════════════════════════════════════");

  while (true) {
    try {
      console.log(`⏰ Tick at ${new Date().toISOString()}`);
      const raw = await fetchRawSignals();
      const index = computeIndexPrice(raw, CURRENT_WEIGHTS);

      console.log(`📈 Computed index: ${index} USD/g`);
      await publishToOracle(oracle, index);
    } catch (err: any) {
      console.error("❌ Tick failed:", err.message || err);
    }

    await new Promise(r => setTimeout(r, WATCHER_INTERVAL));
  }
}

run().catch(err => {
  console.error("❌ Startup failed:", err);
  process.exit(1);
});
