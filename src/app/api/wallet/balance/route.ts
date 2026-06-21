import { NextResponse } from "next/server";
import { ethers } from "ethers";

export const dynamic = "force-dynamic";

const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const AGENT_ADDRESS = "0x5389688243328c26a92b301faEEAb5fbf9AFf105";

const USDC_ABI = [
  "function balanceOf(address account) view returns (uint256)",
];

export async function GET() {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
    const balance: bigint = await usdc.balanceOf(AGENT_ADDRESS);
    return NextResponse.json({
      address: AGENT_ADDRESS,
      balanceMicroUsdc: Number(balance),
      balanceUsdc: Number(balance) / 1_000_000,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
