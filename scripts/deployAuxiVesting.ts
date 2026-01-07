import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("🚀 Deploying AUXI Vesting Contract...\n");

  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer address:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰 Deployer balance:", ethers.formatEther(balance), "BNB\n");

  // Check AUXI token address
  const auxiTokenAddress = process.env.AUXI_TOKEN_ADDRESS;
  if (!auxiTokenAddress) {
    console.error("❌ AUXI_TOKEN_ADDRESS not set in .env!");
    console.error("   Deploy AUXI token first: npm run deploy:token");
    process.exit(1);
  }

  console.log("📍 AUXI Token Address:", auxiTokenAddress);

  // Beneficiary addresses from .env
  const beneficiary1 = process.env.BENEFICIARY_1;
  const beneficiary2 = process.env.BENEFICIARY_2;
  const beneficiary3 = process.env.BENEFICIARY_3;

  if (!beneficiary1 || !beneficiary2 || !beneficiary3) {
    console.error("❌ Beneficiary addresses not set in .env!");
    console.error("   Set BENEFICIARY_1, BENEFICIARY_2, BENEFICIARY_3");
    process.exit(1);
  }

  const beneficiaries = [beneficiary1, beneficiary2, beneficiary3];
  
  // Team allocation: 15% = 15,000,000 AUXI
  // Split: 5,000,000 per beneficiary
  const decimals = 18n;
  const amountPerBeneficiary = 5_000_000n * 10n ** decimals; // 5M AUXI each
  const amounts = [amountPerBeneficiary, amountPerBeneficiary, amountPerBeneficiary];
  
  // Revocability: false for team (non-revocable commitment)
  const revocable = [false, false, false];

  console.log("\n📊 Vesting Configuration:");
  console.log("   Total Team Allocation: 15,000,000 AUXI");
  console.log("   Beneficiaries:", beneficiaries.length);
  beneficiaries.forEach((addr, i) => {
    console.log(`   - ${addr}: ${ethers.formatUnits(amounts[i], 18)} AUXI`);
  });
  console.log("\n   Vesting Schedule:");
  console.log("   - Start: Deploy + 30 days");
  console.log("   - Cliff: 6 months after start");
  console.log("   - End: 36 months after start (3 years total)");
  console.log("   - Release: Linear unlock from cliff to end");

  // Deploy Vesting Contract
  console.log("\n📦 Deploying AuxiVesting contract...");
  const AuxiVesting = await ethers.getContractFactory("AuxiVesting");
  
  const vesting = await AuxiVesting.deploy(
    auxiTokenAddress,
    deployer.address,  // owner (can transfer to multisig later)
    beneficiaries,
    amounts,
    revocable
  );
  await vesting.waitForDeployment();

  const vestingAddress = await vesting.getAddress();
  console.log("✅ AuxiVesting deployed to:", vestingAddress);

  // Verify deployment
  const schedulesCount = await vesting.getSchedulesCount();
  const totalRequired = await vesting.totalRequiredTokens();

  console.log("\n📊 Vesting Contract Info:");
  console.log("   Schedules Count:", schedulesCount.toString());
  console.log("   Total Required Tokens:", ethers.formatUnits(totalRequired, 18), "AUXI");

  // Get schedule details
  for (let i = 0; i < Number(schedulesCount); i++) {
    const info = await vesting.getVestingInfo(i);
    console.log(`\n   Schedule #${i}:`);
    console.log(`   - Beneficiary: ${info.beneficiary}`);
    console.log(`   - Total: ${ethers.formatUnits(info.total, 18)} AUXI`);
    console.log(`   - Start: ${new Date(Number(info.start) * 1000).toISOString()}`);
    console.log(`   - Cliff: ${new Date(Number(info.cliff) * 1000).toISOString()}`);
    console.log(`   - End: ${new Date(Number(info.end) * 1000).toISOString()}`);
  }

  console.log("\n📋 IMPORTANT - Next Steps:");
  console.log("   1. Add AUXI_VESTING_ADDRESS=" + vestingAddress + " to your .env");
  console.log("   2. Transfer 15,000,000 AUXI to the vesting contract:");
  console.log(`      
      const auxi = await ethers.getContractAt("AuxiToken", "${auxiTokenAddress}");
      const tx = await auxi.transfer("${vestingAddress}", ethers.parseUnits("15000000", 18));
      await tx.wait();
      `);
  console.log("   3. Verify the vesting contract is funded:");
  console.log(`      await vesting.isFunded() // should return true`);

  console.log("\n🔍 Verify on BscScan:");
  console.log(`   npx hardhat verify --network bscTestnet ${vestingAddress} \\`);
  console.log(`     "${auxiTokenAddress}" \\`);
  console.log(`     "${deployer.address}" \\`);
  console.log(`     '["${beneficiary1}","${beneficiary2}","${beneficiary3}"]' \\`);
  console.log(`     '["${amountPerBeneficiary.toString()}","${amountPerBeneficiary.toString()}","${amountPerBeneficiary.toString()}"]' \\`);
  console.log(`     '[false,false,false]'`);

  // Return for testing
  return { vesting, vestingAddress };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
