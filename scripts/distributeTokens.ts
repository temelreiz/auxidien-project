import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * AUXIDIEN TOKEN DISTRIBUTION SCRIPT
 * 
 * Tokenomics:
 * - Team & Development: 15% (15,000,000) → Vesting Contract
 * - Treasury / Corporate: 20% (20,000,000) → Treasury Multisig
 * - Liquidity & Market Making: 20% (20,000,000) → Liquidity Address
 * - Public Distribution: 35% (35,000,000) → Public Address
 * - Strategic & Advisors: 10% (10,000,000) → Advisors Vesting/Address
 */

interface Allocation {
  name: string;
  percentage: number;
  amount: bigint;
  address: string;
  category: string;
}

async function main() {
  console.log("🚀 AUXI Token Distribution\n");
  console.log("═".repeat(60));

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer:", deployer.address);

  // Check required addresses
  const auxiTokenAddress = process.env.AUXI_TOKEN_ADDRESS;
  if (!auxiTokenAddress) {
    console.error("❌ AUXI_TOKEN_ADDRESS not set!");
    process.exit(1);
  }

  // Get token contract
  const auxi = await ethers.getContractAt("AuxiToken", auxiTokenAddress);
  const deployerBalance = await auxi.balanceOf(deployer.address);
  
  console.log("📍 AUXI Token:", auxiTokenAddress);
  console.log("💰 Deployer Balance:", ethers.formatUnits(deployerBalance, 18), "AUXI\n");

  const decimals = 18n;
  const MILLION = 1_000_000n * 10n ** decimals;

  // Define allocations
  const allocations: Allocation[] = [
    {
      name: "Team & Development",
      percentage: 15,
      amount: 15n * MILLION,
      address: process.env.AUXI_VESTING_ADDRESS || "",
      category: "Team"
    },
    {
      name: "Treasury / Corporate",
      percentage: 20,
      amount: 20n * MILLION,
      address: process.env.TREASURY_ADDRESS || "",
      category: "Treasury"
    },
    {
      name: "Liquidity & Market Making",
      percentage: 20,
      amount: 20n * MILLION,
      address: process.env.LIQUIDITY_ADDRESS || "",
      category: "Liquidity"
    },
    {
      name: "Public Distribution",
      percentage: 35,
      amount: 35n * MILLION,
      address: process.env.PUBLIC_ADDRESS || "",
      category: "Public"
    },
    {
      name: "Strategic & Advisors",
      percentage: 10,
      amount: 10n * MILLION,
      address: process.env.ADVISORS_ADDRESS || "",
      category: "Advisors"
    }
  ];

  // Display allocation plan
  console.log("📊 Allocation Plan:");
  console.log("═".repeat(60));
  
  let totalAllocation = 0n;
  const pendingAllocations: Allocation[] = [];

  for (const alloc of allocations) {
    totalAllocation += alloc.amount;
    const status = alloc.address ? "✅" : "⚠️  (address not set)";
    console.log(`   ${alloc.name.padEnd(25)} ${alloc.percentage}% | ${ethers.formatUnits(alloc.amount, 18).padStart(12)} AUXI | ${status}`);
    
    if (alloc.address) {
      pendingAllocations.push(alloc);
    }
  }

  console.log("═".repeat(60));
  console.log(`   ${"TOTAL".padEnd(25)} 100% | ${ethers.formatUnits(totalAllocation, 18).padStart(12)} AUXI`);

  // Check balance
  if (deployerBalance < totalAllocation) {
    console.error("\n❌ Insufficient balance for distribution!");
    console.error(`   Required: ${ethers.formatUnits(totalAllocation, 18)} AUXI`);
    console.error(`   Available: ${ethers.formatUnits(deployerBalance, 18)} AUXI`);
    process.exit(1);
  }

  // Confirm distribution
  if (pendingAllocations.length === 0) {
    console.log("\n⚠️  No addresses configured for distribution!");
    console.log("   Set the following in your .env file:");
    console.log("   - AUXI_VESTING_ADDRESS (for Team)");
    console.log("   - TREASURY_ADDRESS");
    console.log("   - LIQUIDITY_ADDRESS");
    console.log("   - PUBLIC_ADDRESS");
    console.log("   - ADVISORS_ADDRESS");
    process.exit(0);
  }

  console.log(`\n🔄 Ready to distribute to ${pendingAllocations.length} addresses...`);
  console.log("   Press Ctrl+C to cancel\n");

  // Wait 5 seconds for user to cancel
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Execute distributions
  console.log("📤 Executing distributions...\n");

  for (const alloc of pendingAllocations) {
    try {
      console.log(`   Transferring ${ethers.formatUnits(alloc.amount, 18)} AUXI to ${alloc.name}...`);
      
      const tx = await auxi.distributeTokens(
        alloc.address,
        alloc.amount,
        alloc.category
      );
      
      console.log(`   TX: ${tx.hash}`);
      await tx.wait();
      console.log(`   ✅ ${alloc.name} - Done!\n`);
      
    } catch (error: any) {
      console.error(`   ❌ ${alloc.name} - Failed: ${error.message}\n`);
    }
  }

  // Final balance check
  const finalBalance = await auxi.balanceOf(deployer.address);
  console.log("═".repeat(60));
  console.log("📊 Distribution Complete!");
  console.log(`   Remaining Balance: ${ethers.formatUnits(finalBalance, 18)} AUXI`);

  // Verify vesting contract funding
  if (process.env.AUXI_VESTING_ADDRESS) {
    const vestingBalance = await auxi.balanceOf(process.env.AUXI_VESTING_ADDRESS);
    console.log(`   Vesting Contract Balance: ${ethers.formatUnits(vestingBalance, 18)} AUXI`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Distribution failed:", error);
    process.exit(1);
  });
