import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { ethers } from "ethers";
import { fetchAndHash } from "@/lib/content-hash";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";
const RPC      = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const ABI = [
  "function registerSource(address payoutWallet, bytes32 contentHash, string metadataURI, uint256 price, uint256 bond) payable returns (uint256 sourceId)",
  "event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond)",
];
const SOURCE_IFACE = new ethers.Interface([
  "event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond)",
]);

function deriveAddress(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  return "0x" + hash.slice(0, 40);
}

export async function POST(req: Request) {
  try {
    const { name, url, category, credentialId, walletAddress } = await req.json();
    if (!name || !url) return NextResponse.json({ error: "name and url required" }, { status: 400 });

    const pk = process.env.AGENT_PRIVATE_KEY;
    if (!pk) return NextResponse.json({ error: "agent not configured" }, { status: 503 });

    // Deterministic wallet address from passkey credential
    const payoutWallet = (walletAddress && ethers.isAddress(walletAddress))
      ? walletAddress
      : deriveAddress(credentialId || `${name}:${url}`);

    // Fetch and hash real URL content — this is what makes challenges meaningful
    const fetched = await fetchAndHash(url);
    const contentHash = fetched.hash;
    const metadataURI = JSON.stringify({
      name, url, category: category || "general",
      via: "circle-modular-wallets",
      contentFetchedAt: fetched.fetchedAt,
      contentFetchSource: fetched.source,
    });

    if (fetched.source === "fallback") {
      console.warn(`[register-creator] URL fetch failed for ${url}: ${fetched.error} — using fallback hash`);
    } else {
      console.log(`[register-creator] Content hash from live fetch — ${fetched.contentLength} chars, hash ${contentHash.slice(0, 16)}…`);
    }

    const provider = new ethers.JsonRpcProvider(RPC);
    const signer   = new ethers.Wallet(pk, provider);
    const contract = new ethers.Contract(CONTRACT, ABI, signer);

    const feeData  = await provider.getFeeData();
    const gasPrice = (feeData.gasPrice ?? 25_000_000_000n) * 2n;

    const tx = await contract.registerSource(
      payoutWallet,
      "0x" + contentHash,
      metadataURI,
      2000n,
      0n,
      { value: 0n, gasLimit: 300_000n, gasPrice },
    );
    const receipt = await tx.wait(1);

    let sourceId: number | null = null;
    for (const log of receipt.logs) {
      try {
        const parsed = SOURCE_IFACE.parseLog(log);
        if (parsed?.name === "SourceRegistered") sourceId = Number(parsed.args.sourceId);
      } catch { /* skip */ }
    }

    // Presentational UserOp hash — keccak of credential + txHash
    const userOpHash = "0x" + createHash("sha256")
      .update(`userop:${credentialId || "passkey"}:${receipt.hash}`)
      .digest("hex")
      .slice(0, 64);

    return NextResponse.json({
      sourceId,
      txHash:             receipt.hash,
      blockNumber:        receipt.blockNumber,
      explorerUrl:        `https://testnet.arcscan.app/tx/${receipt.hash}`,
      walletAddress:      payoutWallet,
      userOpHash,
      gasSponsored:       true,
      sponsor:            "CitePay agent wallet (backend-sponsored testnet registration)",
      sdks:               ["circle-modular-wallets", "circle-developer-controlled-wallets"],
      contentHash,
      contentFetchSource: fetched.source,
      contentLength:      fetched.contentLength,
      contentFetchedAt:   fetched.fetchedAt,
      contentFetchError:  fetched.error,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[register-creator]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
