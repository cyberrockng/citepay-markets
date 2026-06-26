/**
 * Fix on-chain source registration.
 *
 * Problem: sources 1–10 were registered with agent wallet (0x5389) as payoutWallet.
 * Every CitationPaid event since shows creator = agent wallet, not the real creator.
 *
 * Fix: re-register all 10 sources with correct creator payoutWallet values.
 * New on-chain IDs (11–20) will have correct creator addresses in CitationPaid events.
 *
 * Run once:
 *   AGENT_PRIVATE_KEY=0x... npx tsx scripts/fix-source-registration.ts
 */

import { ethers } from "ethers";

const RPC      = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";
const PK       = process.env.AGENT_PRIVATE_KEY!;

const ABI = [
  "function registerSource(address payoutWallet, bytes32 contentHash, string metadataURI, uint256 price, uint256 bond) payable returns (uint256 sourceId)",
  "event SourceRegistered(uint256 indexed sourceId, address indexed creator, address payoutWallet, bytes32 contentHash, uint256 price, uint256 bond)",
];

// Correct creator payoutWallet values — these must match SEED_SOURCES in db.ts
const SOURCES = [
  { title: "x402: HTTP-Native Payments for AI Agents",                      payoutWallet: "0x3a0FfFE64537148b3766dA52D983058F98A4e3ce", contentHash: "0x70f01a7977012702b243e6a6c2509f6a603b7a61e0241a6f0c3ce845949e1d57", price: 2000  },
  { title: "Circle's Programmable Wallets",                                  payoutWallet: "0x72101E4882159f3e0B3c176951AcA7816A1710e2", contentHash: "0x33a7a9314b96f7dbea847c48f7d7cb5ed74537485913516e043b565795a930b5", price: 3000  },
  { title: "Agentic AI: How Autonomous Agents Will Transform Commerce",       payoutWallet: "0xbe575CcebE08895e61c8E45652ff63E4a663d4D9", contentHash: "0x2b02947de287cdddc2d2440d37cc1c5961cb7d70f3407e609f400d757b58dac6", price: 4000  },
  { title: "The Creator Economy in the Age of AI: Who Gets Paid?",           payoutWallet: "0xfccead074A3485751351f6b9FF893866A26632AF", contentHash: "0x256329962cf8c93150940eb17d0a305c284d2b6c0a406a04add51ac658cffb92", price: 2000  },
  { title: "Base: The Onchain Platform for Everyone",                         payoutWallet: "0x6ed34b116B5040072619f83Dc25f64C70584e1F6", contentHash: "0xd282cc888b86dbd8028f9f6af714587c56a00f7264430541e233df145250acb6", price: 1500  },
  { title: "Proof of Personhood and Identity in Decentralized Systems",       payoutWallet: "0xF7b09B900A2676f8c2D8bdFE82FF4B0c4C5A6751", contentHash: "0x610d8c75ff1294ae99afa1f0049511f7ead82b6c2f98caff07ca7e881dafe62b", price: 5000  },
  { title: "HTTP 402 and the Future of Machine Payments",                     payoutWallet: "0xa20C8F958a31A78Be4bcf33CecA8B463636050ce", contentHash: "0x327d0c9a1e2e214d2658b334afac90483ea11836b6676ef8035854a52a08d8b4", price: 2500  },
  { title: "Content Integrity and Hash Verification in Web3",                 payoutWallet: "0x578087F20dfF74e3dB0841C9514285648B4339DE", contentHash: "0x77ed5dbce0e8699cf34d041e4db6af0b697821ea25094eca3ee328a4a3dde5d4", price: 2000  },
  { title: "USDC: The Dollar for the Internet",                               payoutWallet: "0xa9EB31434d3eA3679f36f051492451f3f5912a7C", contentHash: "0xfac45fcf9ee419e9010f1335ea6f744d2ccd9533f68babea3162e6412a3651df", price: 1000  },
  { title: "The Case for AI Agent Accountability",                            payoutWallet: "0x9925e934B9aB91353F8525135A83112dF3FC567a", contentHash: "0x5e49d22dddff4c0357ce8d8c5bf22a75665185ee6cd7c96cd5308b91dac26f13", price: 3000  },
];

async function main() {
  if (!PK) throw new Error("AGENT_PRIVATE_KEY not set");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(PK, provider);
  const contract = new ethers.Contract(CONTRACT, ABI, wallet);

  console.log("Agent wallet:", wallet.address);
  console.log("Contract:    ", CONTRACT);
  console.log("Re-registering", SOURCES.length, "sources with correct creator wallets...\n");

  const newIds: { title: string; oldId: number; newId: number; payoutWallet: string }[] = [];

  for (let i = 0; i < SOURCES.length; i++) {
    const s = SOURCES[i];
    const oldId = i + 1;
    try {
      console.log(`[${oldId}] Registering: ${s.title.slice(0, 50)}...`);
      console.log(`     payoutWallet: ${s.payoutWallet}`);

      const tx = await contract.registerSource(
        s.payoutWallet,
        s.contentHash,
        "", // metadataURI — empty, not needed
        BigInt(s.price),
        0n,
        { value: 0n },
      );
      const receipt = await tx.wait();

      let newId = 0;
      const iface = new ethers.Interface(ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "SourceRegistered") {
            newId = Number(parsed.args.sourceId);
            break;
          }
        } catch { /* skip */ }
      }

      console.log(`     ✓ New sourceId: ${newId}  txHash: ${receipt.hash}\n`);
      newIds.push({ title: s.title, oldId, newId, payoutWallet: s.payoutWallet });

    } catch (err) {
      console.error(`     ✗ Failed for source ${oldId}:`, String(err).slice(0, 120));
    }
  }

  console.log("\n=== RESULT ===");
  console.log("Update SEED_SOURCES in src/lib/db.ts with these new onChainId values:\n");
  for (const r of newIds) {
    console.log(`  onChainId: ${r.newId},  // was ${r.oldId} — "${r.title.slice(0, 50)}"`);
    console.log(`             payoutWallet: "${r.payoutWallet}"`);
  }

  console.log("\nThen commit and deploy. Future CitationPaid events will show correct creator wallets.");
}

main().catch(console.error);
