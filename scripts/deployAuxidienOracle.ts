import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("🚀 Deploying Auxidien Oracle...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(balance), "BNB\n");

  if (balance === 0n) {
    console.error("❌ Deployer has no BNB! Get testnet BNB from faucet:");
    console.error("   https://testnet.bnbchain.org/faucet-smart");
    process.exit(1);
  }

  // Configuration
  // Min update interval: 300 seconds = 5 minutes (can be adjusted)
  const minUpdateInterval = parseInt(process.env.ORACLE_MIN_UPDATE_INTERVAL || "300");
  
  console.log("⚙️  Configuration:");
  console.log("   Min Update Interval:", minUpdateInterval, "seconds");

  // Deploy Oracle
  console.log("\n📦 Deploying AuxidienOracle contract...");
  const AuxidienOracle = await ethers.getContractFactory("AuxidienOracle");
  
  const oracle = await AuxidienOracle.deploy(
    deployer.address,    // admin address
    minUpdateInterval    // minimum seconds between updates
  );
  await oracle.waitForDeployment();

  const oracleAddress = await oracle.getAddress();
  console.log("✅ AuxidienOracle deployed to:", oracleAddress);

  // Verify deployment
  const interval = await oracle.minUpdateInterval();
  const maxChangeRate = await oracle.maxPriceChangeRate();

  console.log("\n📊 Oracle Info:");
  console.log("   Min Update Interval:", interval.toString(), "seconds");
  console.log("   Max Price Change Rate:", maxChangeRate.toString(), "basis points (", Number(maxChangeRate) / 100, "%)");

  console.log("\n📋 Next Steps:");
  console.log("   1. Add AUXIDIEN_ORACLE_ADDRESS=" + oracleAddress + " to your .env");
  console.log("   2. Grant ORACLE_ROLE to your watcher backend:");
  console.log(`      await oracle.grantOracleRole("WATCHER_ADDRESS")`);
  console.log("   3. Start the watcher to begin price updates");

  console.log("\n🔍 Verify on BscScan:");
  console.log(`   npx hardhat verify --network bscTestnet ${oracleAddress} "${deployer.address}" ${minUpdateInterval}`);

  // Return for testing
  return { oracle, oracleAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
