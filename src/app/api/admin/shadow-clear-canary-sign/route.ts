/**
 * One-shot: signs exactly one EIP-712 FloatSpendIntent for the Shadow x CitePay bounded
 * Clear canary, per SHADOW_CITEPAY_SIGNING_HANDOFF.md. Mirrors float-builder-sign.mjs from
 * the shadow repo field-for-field (same domain, same types, same message shape) — it has to
 * run here rather than as that script directly because the signing key
 * (SHADOW_FLOAT_AGENT_PRIVATE_KEY) is Sensitive in Vercel and never leaves this runtime.
 *
 * Does NOT submit any transaction, NOT call settle_clearance, NOT touch the Float line
 * otherwise. Pure local signing — the only network call is the caller (this route) itself;
 * nothing inside it calls writeContract. All parameters are the fixed values from the
 * handoff doc, hardcoded — no caller-supplied overrides accepted.
 *
 * Not a permanent surface — remove after the signed intent is produced and handed off.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAddress, hashTypedData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const config = { maxDuration: 30 };

const ARC_CHAIN_ID = 5_042_002;
const SHADOW_FLOAT_ADDRESS = "0x20dcA96B0C487D94De885c726c956ffaF38b12C2" as Address;
const PROVIDER = getAddress("0x5389688243328c26a92b301faEEAb5fbf9AFf105");
const ENDPOINT_HASH = "0x5e2dcdac7d3a5056e5eb9c81ec0c3bcf60a87a8c4d4d971ca2e17a58a85ff08f" as Hex;
const AMOUNT_USDC = 1000n;
const MAX_DEBT_USDC = 1100n;
const TTL_SECONDS = 3600n;
const EXECUTOR = getAddress("0xBDb1e0718EC6f6e2817c9cd4e5c5ed25Ac191Fb8");
const REASON = "citepay-clear:sha256:43abbc3019e4882d0bbb153c978cb4fa8fa769443c3b02ff8187ccc5960cddb4";
const EXPECTED_AGENT = getAddress("0x236652EAd43fbb0948173fC4dDF23BC0971B274d");

const intentTypes = {
  FloatSpendIntent: [
    { name: "agent", type: "address" },
    { name: "provider", type: "address" },
    { name: "endpointHash", type: "bytes32" },
    { name: "amountUSDC", type: "uint256" },
    { name: "maxDebtUSDC", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "executor", type: "address" },
    { name: "reason", type: "string" },
  ],
} as const;

export async function POST(req: NextRequest) {
  const secret = process.env.SHADOW_CANARY_SIGN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "SHADOW_CANARY_SIGN_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SHADOW_FLOAT_AGENT_PRIVATE_KEY) {
    return NextResponse.json({ error: "SHADOW_FLOAT_AGENT_PRIVATE_KEY not configured" }, { status: 503 });
  }

  const account = privateKeyToAccount(process.env.SHADOW_FLOAT_AGENT_PRIVATE_KEY as Hex);
  if (account.address.toLowerCase() !== EXPECTED_AGENT.toLowerCase()) {
    // Mirrors float-builder-sign.mjs's own safety check — refuse to sign if the configured
    // key doesn't resolve to the agent address Shadow registered.
    return NextResponse.json({ error: `Key resolves to ${account.address}, expected ${EXPECTED_AGENT}. Refusing to sign.` }, { status: 409 });
  }

  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const message = {
    agent: account.address,
    provider: PROVIDER,
    endpointHash: ENDPOINT_HASH,
    amountUSDC: AMOUNT_USDC,
    maxDebtUSDC: MAX_DEBT_USDC,
    nonce: BigInt(Date.now()),
    expiry: nowSec + TTL_SECONDS,
    executor: EXECUTOR,
    reason: REASON,
  };
  const domain = { name: "ShadowFloat", version: "1", chainId: ARC_CHAIN_ID, verifyingContract: SHADOW_FLOAT_ADDRESS } as const;

  const signature = await account.signTypedData({ domain, types: intentTypes, primaryType: "FloatSpendIntent", message });
  const digest = hashTypedData({ domain, types: intentTypes, primaryType: "FloatSpendIntent", message });

  return NextResponse.json({
    intent: {
      agent: message.agent,
      provider: message.provider,
      endpointHash: message.endpointHash,
      amountUSDC: message.amountUSDC.toString(),
      maxDebtUSDC: message.maxDebtUSDC.toString(),
      nonce: message.nonce.toString(),
      expiry: message.expiry.toString(),
      executor: message.executor,
      reason: message.reason,
      float: SHADOW_FLOAT_ADDRESS,
      chainId: ARC_CHAIN_ID,
    },
    signature,
    digest,
  });
}
