#!/usr/bin/env node
/**
 * CitePay MCP stdio server
 *
 * Proxies MCP JSON-RPC 2.0 messages to the CitePay hosted API.
 * Works with Claude Desktop, Claude Code, Cursor, and any MCP-compatible client.
 *
 * Usage (Claude Desktop / claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "citepay": { "command": "npx", "args": ["-y", "citepay-mcp"] }
 *     }
 *   }
 *
 * Usage (Claude Code):
 *   claude mcp add citepay -- npx -y citepay-mcp
 *
 * Tools include CitePay Clear: clear_claim, get_clearance, settle_clearance.
 * clear_claim and settle_clearance require a Clear API key (cpk_...) — set
 * CITEPAY_API_KEY and it's forwarded as an Authorization: Bearer header on
 * every request. get_clearance and the original citation tools are public.
 *
 * Env vars:
 *   CITEPAY_API      — override the CitePay API URL (default: https://citepay-markets.vercel.app/api/mcp)
 *   CITEPAY_API_KEY  — Clear API key (cpk_...), required for clear_claim / settle_clearance
 */

const API_URL = process.env.CITEPAY_API ?? "https://citepay-markets.vercel.app/api/mcp";
const API_KEY = process.env.CITEPAY_API_KEY;

// Server capabilities advertised during MCP handshake
const SERVER_INFO = {
  name: "citepay",
  version: "1.1.0",
};

const CAPABILITIES = {
  tools: {},
};

let inputBuffer = "";

process.stdin.setEncoding("utf8");
process.stdin.resume();

process.stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  let newlineIdx;
  while ((newlineIdx = inputBuffer.indexOf("\n")) !== -1) {
    const line = inputBuffer.slice(0, newlineIdx).trim();
    inputBuffer = inputBuffer.slice(newlineIdx + 1);
    if (line) handleLine(line);
  }
});

process.stdin.on("end", () => process.exit(0));

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

async function handleLine(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    sendError(null, -32700, "Parse error");
    return;
  }

  const { id, method, params } = msg;

  // Handle MCP lifecycle methods locally — no network call needed
  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: CAPABILITIES,
        serverInfo: SERVER_INFO,
      },
    });
    return;
  }

  if (method === "notifications/initialized" || method === "ping") {
    if (id != null) send({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  // Forward everything else to CitePay API
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      sendError(id, -32603, `CitePay API error: HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    send(data);
  } catch (err) {
    sendError(id, -32603, `CitePay connection error: ${err.message}`);
  }
}
