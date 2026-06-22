/**
 * Browser-side x402 payment signing.
 *
 * Replicates what GatewayClient / BatchEvmScheme do server-side so that a
 * session EOA key held in browser memory can sign a real Circle Gateway
 * payment without shipping a private key to the server.
 *
 * EIP-712 domain: { name: "GatewayWalletBatched", version: "1", chainId,
 *   verifyingContract: gatewayWalletAddress }
 * Type: TransferWithAuthorization  (EIP-3009)
 * Payload format:  base64( JSON.stringify({ x402Version, payload: { authorization, signature } }) )
 */

import { privateKeyToAccount } from "viem/accounts";
import { ARC_CHAIN_ID, ARC_GATEWAY_WALLET, QUERY_FEE_MICRO, PAYMENT_RECEIVER } from "./x402";

const BATCHING_NAME    = "GatewayWalletBatched";
const BATCHING_VERSION = "1";
const VALIDITY_WINDOW  = 7 * 24 * 60 * 60 + 100; // 7 days + 100s buffer (Circle minimum)

const AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from",        type: "address" },
    { name: "to",          type: "address" },
    { name: "value",       type: "uint256" },
    { name: "validAfter",  type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce",       type: "bytes32" },
  ],
} as const;

function createNonce(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

export async function signX402Payment(sessionKey: `0x${string}`): Promise<string> {
  const account = privateKeyToAccount(sessionKey);
  const now     = Math.floor(Date.now() / 1000);
  const nonce   = createNonce();

  const authorization = {
    from:        account.address as `0x${string}`,
    to:          PAYMENT_RECEIVER,
    value:       BigInt(QUERY_FEE_MICRO),
    validAfter:  BigInt(now - 600),
    validBefore: BigInt(now + VALIDITY_WINDOW),
    nonce,
  };

  const signature = await account.signTypedData({
    domain: {
      name:              BATCHING_NAME,
      version:           BATCHING_VERSION,
      chainId:           ARC_CHAIN_ID,
      verifyingContract: ARC_GATEWAY_WALLET as `0x${string}`,
    },
    types:       AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message:     authorization,
  });

  const payload = {
    x402Version: 2,
    payload: {
      authorization: {
        from:        authorization.from,
        to:          authorization.to,
        value:       String(authorization.value),
        validAfter:  String(authorization.validAfter),
        validBefore: String(authorization.validBefore),
        nonce:       authorization.nonce,
      },
      signature,
    },
  };

  return btoa(JSON.stringify(payload));
}

export function sessionEOAAddress(sessionKey: `0x${string}`): `0x${string}` {
  return privateKeyToAccount(sessionKey).address;
}
