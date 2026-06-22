/**
 * Circle Programmable Wallets (DCW) session management.
 *
 * Replaces the browser-generated ephemeral EOA with a server-created Circle
 * Developer-Controlled Wallet. EIP-3009 is signed via Circle's HSM (signTypedData)
 * rather than a raw private key held in browser memory.
 *
 * Flow:
 *   createAndFundSessionWallet() → Circle creates wallet on ARC-TESTNET, agent funds it
 *   signSessionPayment(walletId, address) → Circle HSM signs EIP-3009, returns payment-signature
 */

import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { ARC_CHAIN_ID, ARC_GATEWAY_WALLET, QUERY_FEE_MICRO, PAYMENT_RECEIVER } from "./x402";
import { payCreator } from "./payments";

const BLOCKCHAIN = "ARC-TESTNET";
const VALIDITY_WINDOW = 7 * 24 * 60 * 60 + 100; // 7 days + buffer (Circle minimum)

function getDCWClient() {
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) return null;
  return initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
}

// Cached wallet-set ID derived from the pre-existing DCW agent wallet
let _walletSetId: string | null = null;

async function resolveWalletSetId(): Promise<string | null> {
  if (_walletSetId) return _walletSetId;
  if (process.env.CIRCLE_WALLET_SET_ID) {
    _walletSetId = process.env.CIRCLE_WALLET_SET_ID;
    return _walletSetId;
  }
  const client = getDCWClient();
  const walletId = process.env.CIRCLE_WALLET_ID;
  if (!client || !walletId) return null;
  try {
    const resp = await client.getWallet({ id: walletId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsId = (resp.data?.wallet as any)?.walletSetId as string | undefined;
    if (wsId) { _walletSetId = wsId; return wsId; }
  } catch { /* fallthrough */ }
  return null;
}

/** True when Circle DCW is configured and can create session wallets. */
export function isCircleSessionEnabled(): boolean {
  return !!(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID);
}

/**
 * Create a new Circle DCW wallet on Arc Testnet and fund it with QUERY_FEE_MICRO USDC.
 * The funding tx is fire-and-forget — it confirms well before the user submits their query.
 */
export async function createAndFundSessionWallet(): Promise<{ walletId: string; address: string }> {
  const client = getDCWClient();
  if (!client) throw new Error("Circle DCW not configured (CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET missing)");

  const walletSetId = await resolveWalletSetId();
  if (!walletSetId) throw new Error("Could not resolve Circle wallet set ID");

  const resp = await client.createWallets({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blockchains: [BLOCKCHAIN as any],
    count: 1,
    walletSetId,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wallet = (resp.data as any)?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) throw new Error("Circle wallet creation returned no wallet");

  // Fund: send USDC from agent wallet to the new session wallet (fire-and-forget)
  void payCreator({
    creatorWallet: wallet.address as string,
    amountMicroUsdc: QUERY_FEE_MICRO,
    sourceId:  "circle-session",
    receiptId: `circle-session-${wallet.id as string}`,
  }).catch(() => { /* non-fatal — settlement will fail gracefully */ });

  return { walletId: wallet.id as string, address: wallet.address as string };
}

/**
 * Sign an EIP-3009 payment authorization via Circle DCW's signTypedData endpoint.
 * Returns a base64 payment-signature identical in format to the browser EOA path.
 */
export async function signSessionPayment(walletId: string, fromAddress: string): Promise<string> {
  const client = getDCWClient();
  if (!client) throw new Error("Circle DCW not configured");

  const now = Math.floor(Date.now() / 1000);
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(nonceBytes);
  const nonce = `0x${Array.from(nonceBytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;

  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name",             type: "string"  },
        { name: "version",          type: "string"  },
        { name: "chainId",          type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      TransferWithAuthorization: [
        { name: "from",        type: "address" },
        { name: "to",          type: "address" },
        { name: "value",       type: "uint256" },
        { name: "validAfter",  type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce",       type: "bytes32" },
      ],
    },
    domain: {
      name:              "GatewayWalletBatched",
      version:           "1",
      chainId:           ARC_CHAIN_ID,
      verifyingContract: ARC_GATEWAY_WALLET,
    },
    primaryType: "TransferWithAuthorization",
    message: {
      from:        fromAddress,
      to:          PAYMENT_RECEIVER,
      value:       QUERY_FEE_MICRO,
      validAfter:  now - 600,
      validBefore: now + VALIDITY_WINDOW,
      nonce,
    },
  };

  const signResp = await client.signTypedData({ walletId, data: JSON.stringify(typedData) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signature = (signResp.data as any)?.signature as string | undefined;
  if (!signature) throw new Error("Circle DCW signTypedData returned no signature");

  const payload = {
    x402Version: 2,
    payload: {
      authorization: {
        from:        fromAddress,
        to:          PAYMENT_RECEIVER,
        value:       String(QUERY_FEE_MICRO),
        validAfter:  String(now - 600),
        validBefore: String(now + VALIDITY_WINDOW),
        nonce,
      },
      signature,
    },
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
