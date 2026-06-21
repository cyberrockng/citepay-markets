/**
 * On-chain anchor module.
 * Writes PAY decisions to CitePayMarket.sol on Base Sepolia so every
 * paid citation has a verifiable on-chain record alongside the SQLite receipt.
 */
import { ethers } from "ethers";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";
const RPC      = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";

const ABI = [
  "function registerSource(address payoutWallet, bytes32 contentHash, string metadataURI, uint256 price, uint256 bond) payable returns (uint256 sourceId)",
  "function payCitation(uint256 sourceId, bytes32 queryHash, bytes32 evidenceHash) returns (uint256 receiptId)",
  "function getAgentStats(address) view returns (tuple(uint256 bond, int256 reputation, uint256 totalDecisions, uint256 totalPaid, bool authorized))",
  "event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond)",
  "event CitationPaid(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, address creator, uint256 amount, bytes32 queryHash, bytes32 evidenceHash)",
];

/** Logs agent auth/bond state at startup so misconfiguration is visible immediately. */
export async function checkAnchorReady(): Promise<void> {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) { console.warn("[anchor] AGENT_PRIVATE_KEY not set — on-chain anchoring disabled"); return; }
  try {
    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet   = new ethers.Wallet(pk, provider);
    const contract = new ethers.Contract(CONTRACT, ABI, provider);
    const stats    = await contract.getAgentStats(wallet.address);
    if (!stats.authorized) console.warn("[anchor] Agent wallet not authorized on contract — payCitation will revert");
    else if (stats.bond === 0n) console.warn("[anchor] Agent bond is 0 — run: npx tsx scripts/setup-onchain.ts");
    else console.log(`[anchor] Agent ready — authorized, bond ${ethers.formatEther(stats.bond)} ETH`);
  } catch { /* RPC offline — non-fatal */ }
}

const SOURCE_IFACE = new ethers.Interface([
  "event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond)",
]);
const CITATION_IFACE = new ethers.Interface([
  "event CitationPaid(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, address creator, uint256 amount, bytes32 queryHash, bytes32 evidenceHash)",
]);

function getContract() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) return null;
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(pk, provider);
  return new ethers.Contract(CONTRACT, ABI, wallet);
}

// sha256 output is 64 hex chars = exactly 32 bytes, so "0x" + hash is a valid bytes32
function toBytes32(hex64: string): string {
  return hex64.startsWith("0x") ? hex64 : "0x" + hex64;
}

export async function registerSourceOnChain(opts: {
  payoutWallet: string;
  contentHash:  string; // 64-char sha256 hex
  metadataURI:  string;
  price:        number; // micro-USDC
}): Promise<number | null> {
  const contract = getContract();
  if (!contract) return null;

  try {
    const tx = await contract.registerSource(
      opts.payoutWallet,
      toBytes32(opts.contentHash),
      opts.metadataURI || "",
      BigInt(opts.price),
      0n,
      { value: 0n },
    );
    const receipt = await tx.wait();

    for (const log of receipt.logs) {
      try {
        const parsed = SOURCE_IFACE.parseLog(log);
        if (parsed?.name === "SourceRegistered") {
          return Number(parsed.args.sourceId);
        }
      } catch { /* not this event */ }
    }
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[anchor] registerSource failed:", msg);
    return null;
  }
}

export async function anchorPAY(opts: {
  onChainSourceId: number;
  queryHash:       string; // 64-char sha256 hex
  evidenceHash:    string; // 64-char sha256 hex
}): Promise<{ onChainReceiptId: number; txHash: string } | null> {
  const contract = getContract();
  if (!contract || !opts.onChainSourceId) return null;

  try {
    const tx = await contract.payCitation(
      BigInt(opts.onChainSourceId),
      toBytes32(opts.queryHash),
      toBytes32(opts.evidenceHash),
    );
    const receipt = await tx.wait();

    for (const log of receipt.logs) {
      try {
        const parsed = CITATION_IFACE.parseLog(log);
        if (parsed?.name === "CitationPaid") {
          return { onChainReceiptId: Number(parsed.args.receiptId), txHash: receipt.hash };
        }
      } catch { /* not this event */ }
    }
    return { onChainReceiptId: 0, txHash: receipt.hash };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[anchor] payCitation failed:", msg);
    return null;
  }
}
