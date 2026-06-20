/**
 * One-time setup: deposit agent bond so the wallet can call payCitation/recordDecision.
 * Run: npx tsx scripts/setup-onchain.ts
 */
import { ethers } from "ethers";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

const RPC      = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const PK       = process.env.AGENT_PRIVATE_KEY!;
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";
const BOND     = ethers.parseEther("0.001");

const ABI = [
  "function getAgentStats(address) view returns (tuple(uint256 bond, int256 reputation, uint256 totalDecisions, uint256 totalPaid, bool authorized))",
  "function depositAgentBond(uint256 amount) payable",
];

async function main() {
  if (!PK) throw new Error("AGENT_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(PK, provider);
  const market   = new ethers.Contract(CONTRACT, ABI, wallet);

  const before = await market.getAgentStats(wallet.address);
  console.log("Agent:        ", wallet.address);
  console.log("Authorized:   ", before.authorized);
  console.log("Bond before:  ", ethers.formatEther(before.bond), "ETH");

  if (before.bond >= BOND) {
    console.log("Bond already sufficient — nothing to do.");
    return;
  }

  console.log("Depositing 0.001 ETH bond...");
  const tx = await market.depositAgentBond(BOND, { value: BOND });
  console.log("Tx:", tx.hash);
  await tx.wait();

  const after = await market.getAgentStats(wallet.address);
  console.log("Bond after:   ", ethers.formatEther(after.bond), "ETH");
  console.log("Done — agent is bonded and ready.");
}

main().catch((e) => { console.error(e.shortMessage || e.message); process.exit(1); });
