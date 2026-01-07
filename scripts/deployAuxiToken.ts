import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("🚀 Deploying AUXI Token...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(balance), "BNB\n");

  if (balance === 0n) {
    console.error("❌ Deployer has no BNB! Get testnet BNB from faucet:");
    console.error("   https://testnet.bnbchain.org/faucet-smart");
    process.exit(1);
  }

  // Deploy AUXI Token
  console.log("📦 Deploying AuxiToken contract...");
  const AuxiToken = await ethers.getContractFactory("AuxiToken");
  
  // Initial owner is deployer - can be transferred to multisig later
  const auxi = await AuxiToken.deploy(deployer.address);
  await auxi.waitForDeployment();

  const auxiAddress = await auxi.getAddress();
  console.log("✅ AuxiToken deployed to:", auxiAddress);

  // Verify deployment
  const totalSupply = await auxi.totalSupply();
  const name = await auxi.name();
  const symbol = await auxi.symbol();
  const decimals = await auxi.decimals();
  const ownerBalance = await auxi.balanceOf(deployer.address);

  console.log("\n📊 Token Info:");
  console.log("   Name:", name);
  console.log("   Symbol:", symbol);
  console.log("   Decimals:", decimals.toString());
  console.log("   Total Supply:", ethers.formatUnits(totalSupply, 18), "AUXI");
  console.log("   Owner Balance:", ethers.formatUnits(ownerBalance, 18), "AUXI");

  console.log("\n📋 Next Steps:");
  console.log("   1. Add AUXI_TOKEN_ADDRESS=" + auxiAddress + " to your .env");
  console.log("   2. Deploy Oracle: npm run deploy:oracle");
  console.log("   3. Deploy Vesting: npm run deploy:vesting");
  console.log("   4. Distribute tokens to allocation addresses");

  console.log("\n🔍 Verify on BscScan:");
  console.log(`   npx hardhat verify --network bscTestnet ${auxiAddress} "${deployer.address}"`);

  // Return for testing
  return { auxi, auxiAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
