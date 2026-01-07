import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const address = "0xD24B2bca1E0b58a2EAE5b1184871219f9a8EE944";
  
  // Test multiple RPCs
  const rpcs = [
    "https://bsc-dataseed1.binance.org/",
    "https://bsc-dataseed.binance.org/",
    "https://rpc.ankr.com/bsc",
    "https://bsc.publicnode.com",
  ];

  console.log("🔍 Testing RPC connections...\n");
  console.log("Address:", address);
  console.log("ENV RPC:", process.env.BSC_MAINNET_RPC || "(not set)");
  console.log("");

  for (const rpc of rpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      const balance = await provider.getBalance(address);
      console.log(`✅ ${rpc}`);
      console.log(`   Balance: ${ethers.formatEther(balance)} BNB\n`);
    } catch (error: any) {
      console.log(`❌ ${rpc}`);
      console.log(`   Error: ${error.message}\n`);
    }
  }
}

main();
