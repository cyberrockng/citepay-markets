import { NextResponse } from "next/server";
import { ethers } from "ethers";

export const dynamic = "force-dynamic";

const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x396cf1646EbAeF85ee8428C2d9239C46Ae956085";
const RPC      = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";

const CITATION_ABI = [
  "event CitationPaid(uint256 indexed receiptId, uint256 indexed sourceId, address indexed agent, address creator, uint256 amount, bytes32 queryHash, bytes32 evidenceHash)",
];

export async function GET() {
  try {
    const provider  = new ethers.JsonRpcProvider(RPC);
    const contract  = new ethers.Contract(CONTRACT, CITATION_ABI, provider);
    const latest    = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - 10000);

    const filter = contract.filters.CitationPaid();
    const raw    = await contract.queryFilter(filter, fromBlock, "latest") as ethers.EventLog[];

    const events = raw.map((e) => {
      const amountMicro = Number(e.args[4]);
      return {
        receiptId:  Number(e.args[0]),
        sourceId:   Number(e.args[1]),
        agent:      String(e.args[2]),
        creator:    String(e.args[3]),
        amountMicro,
        amountUSDC: amountMicro / 1e6,
        queryHash:  String(e.args[5]),
        txHash:     e.transactionHash,
        blockNumber: e.blockNumber,
        arcScanUrl: `https://testnet.arcscan.app/tx/${e.transactionHash}`,
      };
    }).reverse();

    const totalUSDC = events.reduce((s, e) => s + e.amountUSDC, 0);

    return NextResponse.json({
      events,
      totalEvents: events.length,
      totalUSDC,
      contractAddress: CONTRACT,
      contractExplorerUrl: `https://testnet.arcscan.app/address/${CONTRACT}`,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      events: [],
      totalEvents: 0,
      totalUSDC: 0,
      contractAddress: CONTRACT,
      contractExplorerUrl: `https://testnet.arcscan.app/address/${CONTRACT}`,
      error: String(err),
      generatedAt: new Date().toISOString(),
    }, { status: 200 });
  }
}
