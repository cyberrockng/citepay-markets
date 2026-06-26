/**
 * On-chain anchor module.
 * Writes PAY decisions to CitePayMarket.sol on Arc Testnet so every
 * paid citation has a verifiable on-chain record alongside the SQLite receipt.
 *
 * Signing priority:
 *   1. Circle W3S (MPC — no local key) when CIRCLE_API_KEY + CIRCLE_WALLET_ID set
 *   2. AGENT_PRIVATE_KEY fallback (ethers.js direct signing)
 *
 * Also integrates CitationMandate.sol (per-session policy attestation) and
 * CreatorBond.sol (creator bond status queries).
 */
import { ethers } from "ethers";
import { isW3SEnabled, w3sPayCitation, w3sCreateMandate, w3sCloseMandate } from "./circle-w3s";

const CONTRACT          = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS        || "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";
const BOND_CONTRACT     = process.env.ARC_CREATOR_BOND_ADDRESS            || "";
const MANDATE_CONTRACT  = process.env.ARC_CITATION_MANDATE_ADDRESS        || "";
const RPC               = process.env.ARC_RPC_URL                         || "https://rpc.testnet.arc.network";

const ABI = [
  "function registerSource(address payoutWallet, bytes32 contentHash, string metadataURI, uint256 price, uint256 bond) payable returns (uint256 sourceId)",
  "function payCitation(uint256 sourceId, bytes32 queryHash, bytes32 evidenceHash) returns (uint256 receiptId)",
  "function getAgentStats(address) view returns (tuple(uint256 bond, int256 reputation, uint256 totalDecisions, uint256 totalPaid, bool authorized))",
  "event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond)",
  "event CitationPaid(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, address creator, uint256 amount, bytes32 queryHash, bytes32 evidenceHash)",
];

const BOND_ABI = [
  "function isBonded(address creator) view returns (bool)",
  "function getBond(address creator) view returns (tuple(uint256 amountWei, uint256 postedAt, bool active, uint256 slashCount))",
];

const MANDATE_ABI = [
  "function createMandate(bytes32 policyHash, uint256 maxPerCitation, uint256 sessionCap, uint256 minRelevanceScore, bool requireBonded) returns (uint256 mandateId)",
  "function checkAndRecord(uint256 mandateId, uint256 sourceId, bytes32 evidenceHash, uint256 amountMicro, uint256 relevanceScore, bool creatorBonded) returns (bool allowed, uint8 blockReason)",
  "function closeMandate(uint256 mandateId)",
  "event MandateCreated(uint256 indexed mandateId, address indexed agent, bytes32 policyHash, uint256 sessionCap, uint256 maxPerCitation, uint256 minRelevanceScore, bool requireBonded)",
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

function getWallet() {
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk) return null;
  return new ethers.Wallet(pk, new ethers.JsonRpcProvider(RPC));
}

function getContract() {
  const wallet = getWallet();
  if (!wallet) return null;
  return new ethers.Contract(CONTRACT, ABI, wallet);
}

function getBondContract() {
  const wallet = getWallet();
  if (!wallet || !BOND_CONTRACT) return null;
  return new ethers.Contract(BOND_CONTRACT, BOND_ABI, wallet);
}

function getMandateContract() {
  const wallet = getWallet();
  if (!wallet || !MANDATE_CONTRACT) return null;
  return new ethers.Contract(MANDATE_CONTRACT, MANDATE_ABI, wallet);
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
  // Optional mandate integration
  mandateId?:      number;
  amountMicro?:    number;
  relevanceScore?: number;
  creatorBonded?:  boolean;
}): Promise<{ onChainReceiptId: number; txHash: string; mandateAllowed?: boolean } | null> {
  if (!opts.onChainSourceId) return null;

  // ── Preferred path: Circle W3S — no local key ────────────────────────────
  if (isW3SEnabled()) {
    try {
      const w3s = await w3sPayCitation({
        contract:     CONTRACT,
        sourceId:     opts.onChainSourceId,
        queryHash:    toBytes32(opts.queryHash) as `0x${string}`,
        evidenceHash: toBytes32(opts.evidenceHash) as `0x${string}`,
      });
      if (w3s) {
        let mandateAllowed: boolean | undefined;
        if (opts.mandateId && opts.amountMicro !== undefined && opts.relevanceScore !== undefined) {
          mandateAllowed = await recordMandateDecision({
            mandateId: opts.mandateId, sourceId: opts.onChainSourceId,
            evidenceHash: opts.evidenceHash, amountMicro: opts.amountMicro,
            relevanceScore: opts.relevanceScore, creatorBonded: opts.creatorBonded ?? false,
          });
        }
        console.log(`[anchor] payCitation via W3S — tx ${w3s.txHash}`);
        return { onChainReceiptId: w3s.onChainReceiptId, txHash: w3s.txHash, mandateAllowed };
      }
    } catch (err) {
      console.warn("[anchor] W3S payCitation failed, falling back:", String(err).slice(0, 100));
    }
  }

  // ── Fallback: ethers.js with AGENT_PRIVATE_KEY ───────────────────────────
  const contract = getContract();
  if (!contract) return null;

  try {
    const tx = await contract.payCitation(
      BigInt(opts.onChainSourceId),
      toBytes32(opts.queryHash),
      toBytes32(opts.evidenceHash),
    );
    const receipt = await tx.wait();

    let onChainReceiptId = 0;
    for (const log of receipt.logs) {
      try {
        const parsed = CITATION_IFACE.parseLog(log);
        if (parsed?.name === "CitationPaid") {
          onChainReceiptId = Number(parsed.args.receiptId);
          break;
        }
      } catch { /* not this event */ }
    }

    // Record against mandate if configured
    let mandateAllowed: boolean | undefined;
    if (opts.mandateId && opts.amountMicro !== undefined && opts.relevanceScore !== undefined) {
      mandateAllowed = await recordMandateDecision({
        mandateId:      opts.mandateId,
        sourceId:       opts.onChainSourceId,
        evidenceHash:   opts.evidenceHash,
        amountMicro:    opts.amountMicro,
        relevanceScore: opts.relevanceScore,
        creatorBonded:  opts.creatorBonded ?? false,
      });
    }

    return { onChainReceiptId, txHash: receipt.hash, mandateAllowed };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[anchor] payCitation failed:", msg);
    return null;
  }
}

// ─── CreatorBond integration ──────────────────────────────────────────────────

export async function isBondedOnChain(creatorAddress: string): Promise<boolean> {
  const bondContract = getBondContract();
  if (!bondContract) return false;
  try {
    return await bondContract.isBonded(creatorAddress);
  } catch {
    return false;
  }
}

// ─── CitationMandate integration ──────────────────────────────────────────────

import type { AgentPolicy } from "./policy";

const MANDATE_CREATED_IFACE = new ethers.Interface([
  "event MandateCreated(uint256 indexed mandateId, address indexed agent, bytes32 policyHash, uint256 sessionCap, uint256 maxPerCitation, uint256 minRelevanceScore, bool requireBonded)",
]);

/**
 * Creates a per-session on-chain mandate before a query session starts.
 * Records the agent's policy commitment so every PAY can be checked against it.
 */
export async function createMandateOnChain(policy: AgentPolicy): Promise<number | null> {
  const policyHash = ethers.keccak256(ethers.toUtf8Bytes(policy.name.toLowerCase())) as `0x${string}`;

  // ── Preferred path: Circle W3S ────────────────────────────────────────────
  if (isW3SEnabled() && MANDATE_CONTRACT) {
    try {
      const w3s = await w3sCreateMandate({
        contract:       MANDATE_CONTRACT,
        policyHash,
        maxPerCitation: policy.maxPricePerCitation || 10_000,
        sessionCap:     policy.sessionSpendCap     || 100_000,
        minRelevance:   policy.minRelevanceScore   || 0,
        requireBonded:  policy.requireBonded,
      });
      if (w3s) {
        console.log(`[anchor] Mandate ${w3s.mandateId} created via W3S`);
        return w3s.mandateId;
      }
    } catch (err) {
      console.warn("[anchor] W3S createMandate failed, falling back:", String(err).slice(0, 100));
    }
  }

  // ── Fallback: ethers.js ───────────────────────────────────────────────────
  const mandateContract = getMandateContract();
  if (!mandateContract) return null;
  try {
    const tx = await mandateContract.createMandate(
      policyHash,
      BigInt(policy.maxPricePerCitation || 10_000),
      BigInt(policy.sessionSpendCap     || 100_000),
      BigInt(policy.minRelevanceScore   || 0),
      policy.requireBonded,
    );
    const receipt = await tx.wait();
    for (const log of receipt.logs) {
      try {
        const parsed = MANDATE_CREATED_IFACE.parseLog(log);
        if (parsed?.name === "MandateCreated") {
          const id = Number(parsed.args.mandateId);
          console.log(`[anchor] Mandate ${id} created on-chain`);
          return id;
        }
      } catch { /* skip */ }
    }
    return null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[anchor] createMandate failed:", msg);
    return null;
  }
}

/**
 * Records a PAY decision against the session mandate.
 * Emits CitationAllowed or CitationBlocked on-chain.
 */
async function recordMandateDecision(opts: {
  mandateId:      number;
  sourceId:       number;
  evidenceHash:   string;
  amountMicro:    number;
  relevanceScore: number;
  creatorBonded:  boolean;
}): Promise<boolean> {
  const mandateContract = getMandateContract();
  if (!mandateContract) return true; // fail-open when contract not configured
  try {
    const tx = await mandateContract.checkAndRecord(
      BigInt(opts.mandateId),
      BigInt(opts.sourceId),
      toBytes32(opts.evidenceHash),
      BigInt(opts.amountMicro),
      BigInt(opts.relevanceScore),
      opts.creatorBonded,
    );
    const receipt = await tx.wait();
    // Check for CitationAllowed (topic[0] matches) vs CitationBlocked
    const allowedTopic = ethers.id("CitationAllowed(uint256,uint256,bytes32,uint256,uint256,uint256)");
    const wasAllowed = receipt.logs.some((l: { topics: string[] }) => l.topics[0] === allowedTopic);
    console.log(`[anchor] Mandate ${opts.mandateId}: ${wasAllowed ? "ALLOWED" : "BLOCKED"} source ${opts.sourceId}`);
    return wasAllowed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[anchor] checkAndRecord failed:", msg);
    return true; // fail-open
  }
}

/**
 * Anchors a BLOCKED_BY_POLICY decision on CitationMandate.sol.
 * Records on-chain proof that a policy rule blocked a citation — not just PAY decisions.
 * Fail-open: never throws or blocks the response.
 */
export async function anchorBLOCKED(opts: {
  queryHash:   string;
  evidenceHash: string;
  policyRule:  string;
  mandateId?:  number;
}): Promise<void> {
  const mandateContract = getMandateContract();
  if (!mandateContract || !opts.mandateId) {
    console.log(`[anchor] BLOCKED_BY_POLICY — rule: ${opts.policyRule} (mandate not configured, skipping on-chain)`);
    return;
  }
  try {
    // Use checkAndRecord with amount=0 to record the blocked decision
    const tx = await mandateContract.checkAndRecord(
      BigInt(opts.mandateId),
      BigInt(0), // sourceId 0 = blocked before source was identified
      toBytes32(opts.evidenceHash),
      BigInt(0), // amount = 0 (blocked, no payment)
      BigInt(0), // relevanceScore = 0
      false,     // creatorBonded = false (we don't know at this point)
    );
    await tx.wait();
    console.log(`[anchor] BLOCKED_BY_POLICY anchored on-chain — rule: ${opts.policyRule} mandate: ${opts.mandateId}`);
  } catch (e: unknown) {
    console.log(`[anchor] anchorBLOCKED failed (non-fatal): ${String(e)}`);
  }
}

/**
 * Closes the session mandate and records final tally on-chain.
 */
export async function closeMandateOnChain(mandateId: number): Promise<void> {
  if (!mandateId) return;

  // ── Preferred path: Circle W3S ────────────────────────────────────────────
  if (isW3SEnabled() && MANDATE_CONTRACT) {
    try {
      const ok = await w3sCloseMandate({ contract: MANDATE_CONTRACT, mandateId });
      if (ok) { console.log(`[anchor] Mandate ${mandateId} closed via W3S`); return; }
    } catch (err) {
      console.warn("[anchor] W3S closeMandate failed, falling back:", String(err).slice(0, 100));
    }
  }

  // ── Fallback: ethers.js ───────────────────────────────────────────────────
  const mandateContract = getMandateContract();
  if (!mandateContract) return;
  try {
    const tx = await mandateContract.closeMandate(BigInt(mandateId));
    await tx.wait();
    console.log(`[anchor] Mandate ${mandateId} closed`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[anchor] closeMandate failed:", msg);
  }
}
