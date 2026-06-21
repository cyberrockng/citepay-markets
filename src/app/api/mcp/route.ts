/**
 * POST /api/mcp
 *
 * CitePay MCP Server — Model Context Protocol (MCP) over HTTP JSON-RPC 2.0.
 *
 * Compatible with Claude Desktop, Cursor, and any MCP client that supports
 * HTTP transport (no SSE required — stateless request/response).
 *
 * Tools:
 *   cite_query   — run a full citation query: score sources, pay creators, return answer
 *   get_receipt  — fetch a stored receipt by ID
 *   check_policy — evaluate a query/source setup against a named policy preset
 *
 * Authentication:
 *   Set MCP_API_KEY env var to require X-API-KEY header. Omit for open access.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import { runBuyerAgent, getAgentAddress } from "@/lib/agent";
import {
  getAllSources, insertQuery, updateQuery, insertReceipt,
  updateSourceStats, getReceiptById, updateReceiptOnChain,
} from "@/lib/db";
import { buildEvidencePreimage, hashEvidence, sha256, parseUSDC } from "@/lib/evidence";
import { payCreator } from "@/lib/payments";
import { anchorPAY } from "@/lib/anchor";
import { resolvePolicy, POLICY_PRESETS } from "@/lib/policy";
import { signReceiptHash } from "@/lib/signature";

export const dynamic = "force-dynamic";

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

function ok(id: JsonRpcRequest["id"], result: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, result } as JsonRpcResponse);
}

function err(id: JsonRpcRequest["id"], code: number, message: string, data?: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message, data } } as JsonRpcResponse);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "cite_query",
    description: "Run a citation query against the CitePay source market. The CitePay agent scores sources for relevance, pays creators in USDC, and returns a cited answer. Every decision is recorded as a public Policy Receipt.",
    inputSchema: {
      type: "object",
      properties: {
        query:  { type: "string",  description: "The research question to answer." },
        budget: { type: "number",  description: "Max USDC budget (default 0.05, min 0.01, max 1.0)." },
        policy: { type: "string",  description: "Agent spend policy: 'conservative', 'balanced', or 'aggressive' (default 'balanced').", enum: ["conservative", "balanced", "aggressive"] },
        category: { type: "string", description: "Filter sources by category: 'Protocol', 'Research', 'Infrastructure', 'AI/Agents'." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_receipt",
    description: "Fetch a CitePay Policy Receipt by ID. Returns the full receipt including evidence hash, agent signature, payment status, and policy outcome.",
    inputSchema: {
      type: "object",
      properties: {
        receipt_id: { type: "string", description: "The receipt UUID to retrieve." },
      },
      required: ["receipt_id"],
    },
  },
  {
    name: "check_policy",
    description: "Describe CitePay agent spend policies. Returns the rules for each preset (Conservative, Balanced, Aggressive) and what they enforce.",
    inputSchema: {
      type: "object",
      properties: {
        policy: { type: "string", description: "Policy name to inspect. Omit to return all presets.", enum: ["conservative", "balanced", "aggressive"] },
      },
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleCiteQuery(args: Record<string, unknown>) {
  const query = (args.query as string || "").trim();
  if (!query) throw new Error("query is required");

  const budgetUsdc = typeof args.budget === "number" ? args.budget : 0.05;
  const budgetMicro = parseUSDC(Math.max(0.01, Math.min(1.0, budgetUsdc)));
  const policy = resolvePolicy(args.policy as string | undefined);
  const category = typeof args.category === "string" ? args.category : undefined;

  const queryId = uuidv4();
  const queryHash = sha256(query);
  const agentAddress = getAgentAddress();

  insertQuery({
    id: queryId, query, queryHash, budget: budgetMicro, agentAddress,
    queryFee: 0, queryFeeTxHash: null, status: "paid",
    totalPaid: 0, receiptIds: [], answer: null,
    createdAt: new Date().toISOString(),
  });

  const sources = getAllSources(category).filter((s) => s.active);
  const decisions = await runBuyerAgent(query, budgetMicro, sources, policy);

  const receiptIds: string[] = [];
  let totalPaid = 0;
  let budgetRemaining = budgetMicro;
  const receiptsOut: Record<string, unknown>[] = [];

  for (const d of decisions) {
    const receiptId = uuidv4();
    let txHash: string | null = null;
    let paymentStatus: "confirmed" | "simulated" | null = null;

    const preimage = buildEvidencePreimage({
      query, queryHash, sourceUrl: d.source.url,
      excerptUsed: d.excerptUsed || "", decision: d.decision,
      scores: d.scores, budgetBefore: budgetRemaining,
      reason: d.reason, price: d.source.price,
      bonded: d.source.bonded, reputation: d.source.reputation,
    });
    const evidenceHash = hashEvidence(preimage);
    const agentSignature = await signReceiptHash(evidenceHash);

    if (d.decision === "PAY") {
      const payment = await payCreator({
        creatorWallet: d.source.payoutWallet,
        amountMicroUsdc: d.source.price,
        sourceId: d.source.id,
        receiptId,
      });
      txHash = payment.txHash;
      paymentStatus = payment.status;
      totalPaid += d.source.price;
      budgetRemaining -= d.source.price;
    }

    const receipt = {
      id: receiptId, sourceId: d.source.id, queryId, agentAddress,
      creatorWallet: d.source.payoutWallet, decision: d.decision,
      query, queryHash, sourceTitle: d.source.title, sourceUrl: d.source.url,
      amountPaid: d.decision === "PAY" ? d.source.price : 0,
      evidenceHash, evidencePreimage: preimage,
      contentHashAtDecision: d.source.contentHash,
      scores: d.scores, reason: d.reason, txHash, paymentStatus,
      policyProfile: d.policyProfile, policyRulesPassed: d.policyRulesPassed,
      policyRulesFailed: d.policyRulesFailed, policyReason: d.policyReason,
      agentSignature,
      budgetBefore: budgetRemaining + (d.decision === "PAY" ? d.source.price : 0),
      budgetAfter: budgetRemaining, challenged: false,
      createdAt: new Date().toISOString(),
    };
    insertReceipt(receipt);

    if (d.decision === "PAY" && d.source.onChainId) {
      const anchor = await anchorPAY({
        onChainSourceId: d.source.onChainId, queryHash, evidenceHash,
      });
      if (anchor) updateReceiptOnChain(receiptId, anchor.onChainReceiptId, anchor.txHash);
    }
    updateSourceStats(d.source.id, d.decision);
    receiptIds.push(receiptId);
    receiptsOut.push({
      receiptId, decision: d.decision, source: d.source.title,
      amountPaid: d.decision === "PAY" ? d.source.price : 0,
      evidenceHash, agentSignature,
      receiptUrl: `/receipt/${receiptId}`,
      policyProfile: d.policyProfile,
    });
  }

  const paidSources = decisions.filter((d) => d.decision === "PAY");
  let answer = "No sources were paid for this query.";

  if (paidSources.length > 0) {
    const context = paidSources
      .map((d) => `[${d.source.title}](${d.source.url}): ${d.excerptUsed}`)
      .join("\n");
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const resp = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `Answer using ONLY these cited sources. Cite inline like [Source Title].\n\nQuestion: ${query}\n\nSources:\n${context}\n\nConcise answer with citations:`,
        }],
      });
      answer = (resp.content[0] as { text: string }).text;
    } catch {
      answer = `Based on ${paidSources.length} source(s): ${paidSources.map((d) => d.source.title).join(", ")}.`;
    }
  }

  updateQuery(queryId, { status: "completed", answer, receiptIds, totalPaid });

  return {
    queryId, answer, policyProfile: policy.name,
    totalPaid, totalPaidUsdc: totalPaid / 1_000_000,
    sourcesCited: paidSources.length,
    decisions: receiptsOut,
    receiptIds,
  };
}

function handleGetReceipt(args: Record<string, unknown>) {
  const id = (args.receipt_id as string || "").trim();
  if (!id) throw new Error("receipt_id is required");
  const receipt = getReceiptById(id);
  if (!receipt) throw new Error(`Receipt ${id} not found`);
  return { receipt };
}

function handleCheckPolicy(args: Record<string, unknown>) {
  const key = (args.policy as string | undefined)?.toLowerCase();
  if (key && POLICY_PRESETS[key as keyof typeof POLICY_PRESETS]) {
    return { policy: POLICY_PRESETS[key as keyof typeof POLICY_PRESETS] };
  }
  return { presets: POLICY_PRESETS };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Optional API key auth
  const requiredKey = process.env.MCP_API_KEY;
  if (requiredKey) {
    const provided = req.headers.get("x-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== requiredKey) {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
        { status: 401 }
      );
    }
  }

  let rpc: JsonRpcRequest;
  try {
    rpc = await req.json();
  } catch {
    return err(null, -32700, "Parse error");
  }

  const { id, method, params = {} } = rpc;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "citepay-markets", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const name = params.name as string;
    const args = (params.arguments as Record<string, unknown>) ?? {};

    try {
      let result: unknown;
      if (name === "cite_query")   result = await handleCiteQuery(args);
      else if (name === "get_receipt")  result = handleGetReceipt(args);
      else if (name === "check_policy") result = handleCheckPolicy(args);
      else return err(id, -32601, `Unknown tool: ${name}`);

      return ok(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (e) {
      return ok(id, {
        content: [{ type: "text", text: `Error: ${String(e)}` }],
        isError: true,
      });
    }
  }

  if (method === "notifications/initialized") {
    return new NextResponse(null, { status: 204 });
  }

  return err(id, -32601, `Method not found: ${method}`);
}

/** GET /api/mcp — MCP server metadata */
export async function GET() {
  return NextResponse.json({
    name: "CitePay Markets MCP Server",
    version: "1.0.0",
    protocol: "MCP 2024-11-05",
    transport: "HTTP JSON-RPC 2.0",
    endpoint: "POST /api/mcp",
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    usage: {
      claude_desktop_config: {
        mcpServers: {
          citepay: {
            command: "npx",
            args: ["-y", "mcp-remote", "https://citepay-markets.vercel.app/api/mcp"],
          },
        },
      },
      direct_call: {
        method: "POST",
        url: "/api/mcp",
        body: {
          jsonrpc: "2.0", id: "1", method: "tools/call",
          params: { name: "cite_query", arguments: { query: "What is x402?", budget: 0.05, policy: "balanced" } },
        },
      },
    },
  });
}
