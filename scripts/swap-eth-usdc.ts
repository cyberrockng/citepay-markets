/**
 * Swap 0.02 ETH → USDC on Base Sepolia via Uniswap V3 SwapRouter02.
 * Run: npx tsx scripts/swap-eth-usdc.ts
 */
import { ethers } from "ethers";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const PK = process.env.AGENT_PRIVATE_KEY!;

const SWAP_ROUTER = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4";
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const FEE = 3000; // 0.3% pool
const AMOUNT_IN = ethers.parseEther("0.02");

// SwapRouter02 interface — no deadline field
const ROUTER_ABI = [
  `function exactInputSingle(
    tuple(
      address tokenIn,
      address tokenOut,
      uint24 fee,
      address recipient,
      uint256 amountIn,
      uint256 amountOutMinimum,
      uint160 sqrtPriceLimitX96
    ) params
  ) payable returns (uint256 amountOut)`,
];

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  if (!PK) throw new Error("AGENT_PRIVATE_KEY not set in .env.local");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);

  const ethBefore = await provider.getBalance(wallet.address);
  const usdc = new ethers.Contract(USDC, USDC_ABI, provider);
  const usdcBefore = await usdc.balanceOf(wallet.address);

  console.log("Wallet:       ", wallet.address);
  console.log("ETH before:   ", ethers.formatEther(ethBefore), "ETH");
  console.log("USDC before:  ", ethers.formatUnits(usdcBefore, 6), "USDC");
  console.log();

  const router = new ethers.Contract(SWAP_ROUTER, ROUTER_ABI, wallet);

  const params = {
    tokenIn: WETH,
    tokenOut: USDC,
    fee: FEE,
    recipient: wallet.address,
    amountIn: AMOUNT_IN,
    amountOutMinimum: 0n, // testnet — no slippage protection needed
    sqrtPriceLimitX96: 0n,
  };

  console.log("Swapping 0.02 ETH → USDC (Uniswap V3, 0.3% pool)...");
  const tx = await router.exactInputSingle(params, { value: AMOUNT_IN });
  console.log("Tx hash:      ", tx.hash);
  console.log("Waiting for confirmation...");

  const receipt = await tx.wait();
  console.log("Block:        ", receipt.blockNumber);
  console.log("Status:       ", receipt.status === 1 ? "SUCCESS" : "FAILED");

  const ethAfter = await provider.getBalance(wallet.address);
  const usdcAfter = await usdc.balanceOf(wallet.address);

  console.log();
  console.log("ETH after:    ", ethers.formatEther(ethAfter), "ETH");
  console.log("USDC after:   ", ethers.formatUnits(usdcAfter, 6), "USDC");
  console.log("USDC received:", ethers.formatUnits(usdcAfter - usdcBefore, 6), "USDC");
  console.log();
  console.log("BaseScan:", `https://sepolia.basescan.org/tx/${tx.hash}`);
}

main().catch((e) => {
  console.error("Swap failed:", e.shortMessage || e.message);
  process.exit(1);
});
