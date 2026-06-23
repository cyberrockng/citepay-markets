import { createWalletClient, http, hashTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";

// Load env
const env = Object.fromEntries(
  readFileSync("/tmp/citepay-prod-env", "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => [l.split("=")[0], l.split("=").slice(1).join("=").replace(/^"|"$/g, "")])
);

const PRIVATE_KEY = env.AGENT_PRIVATE_KEY;
const EXPECTED_AGENT = "0xA539A18B55E5E3b98892C724f8f75914c0B69942";

const account = privateKeyToAccount(PRIVATE_KEY);
if (account.address.toLowerCase() !== EXPECTED_AGENT.toLowerCase()) {
  console.error(`Key mismatch: derived ${account.address}, expected ${EXPECTED_AGENT}`);
  process.exit(1);
}

// EIP-712 domain + types from the guide
const domain = {
  name: "ShadowFloat",
  version: "1",
  chainId: 5042002,
  verifyingContract: "0x5d64750e199bb27Cb03C3C523A630a3dB215435b",
};

const types = {
  FloatSpendIntent: [
    { name: "agent",        type: "address" },
    { name: "provider",     type: "address" },
    { name: "endpointHash", type: "bytes32" },
    { name: "amountUSDC",   type: "uint256" },
    { name: "nonce",        type: "uint256" },
    { name: "expiry",       type: "uint256" },
    { name: "reason",       type: "string"  },
  ],
};

const message = {
  agent:        EXPECTED_AGENT,
  provider:     "0x8ddf06fE8985988d3e0883F945E891BD57084937",
  endpointHash: "0x54f180bcd31ab4c3401b23bc78cb3eeb89f85d42a3b43e3d06a692b91d941160",
  amountUSDC:   10000n,
  nonce:        BigInt(Date.now()),
  expiry:       BigInt(Math.floor(Date.now() / 1000) + 600000), // ~7 days
  reason:       "My citation agent uses Shadow Float to access x402-gated market data before routing USDC payments to cited creators on Arc.",
};

const client = createWalletClient({ account, transport: http("https://rpc.testnet.arc.network") });

const signature = await client.signTypedData({ domain, types, primaryType: "FloatSpendIntent", message });
const digest    = hashTypedData({ domain, types, primaryType: "FloatSpendIntent", message });

const output = {
  intent: {
    agent:        message.agent,
    provider:     message.provider,
    endpointHash: message.endpointHash,
    amountUSDC:   message.amountUSDC.toString(),
    nonce:        message.nonce.toString(),
    expiry:       message.expiry.toString(),
    reason:       message.reason,
    float:        domain.verifyingContract,
    chainId:      domain.chainId,
  },
  signature,
  digest,
};

console.log(JSON.stringify(output, null, 2));
