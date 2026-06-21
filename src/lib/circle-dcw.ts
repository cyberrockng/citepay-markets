import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { ARC_USDC } from "./x402";

let _client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

function getDCWClient() {
  if (_client) return _client;
  const apiKey = process.env.CIRCLE_API_KEY;
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!apiKey || !entitySecret) return null;
  _client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
  return _client;
}

export function isDCWEnabled() {
  return !!(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET && process.env.CIRCLE_WALLET_ID);
}

export async function getDCWWalletInfo() {
  const client = getDCWClient();
  const walletId = process.env.CIRCLE_WALLET_ID;
  if (!client || !walletId) return null;
  try {
    const [walletResp, balResp] = await Promise.all([
      client.getWallet({ id: walletId }),
      client.getWalletTokenBalance({ id: walletId }),
    ]);
    return {
      walletId,
      address: walletResp.data?.wallet?.address ?? process.env.CIRCLE_WALLET_ADDRESS,
      blockchain: walletResp.data?.wallet?.blockchain,
      state: walletResp.data?.wallet?.state,
      custodyType: walletResp.data?.wallet?.custodyType,
      tokenBalances: balResp.data?.tokenBalances ?? [],
    };
  } catch {
    return null;
  }
}

export async function payCreatorViaDCW(opts: {
  creatorWallet: string;
  amountMicroUsdc: number;
  receiptId: string;
}): Promise<{ txHash: string; status: "confirmed" | "pending" | "simulated" }> {
  const client = getDCWClient();
  const walletId = process.env.CIRCLE_WALLET_ID;
  if (!client || !walletId) throw new Error("DCW not configured");

  const usdcAddress = (process.env.ARC_USDC_ADDRESS || ARC_USDC) as string;

  // Encode ERC-20 transfer(address,uint256) calldata
  const { encodeFunctionData } = await import("viem");
  const { erc20Abi } = await import("viem");
  const calldata = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [opts.creatorWallet as `0x${string}`, BigInt(opts.amountMicroUsdc)],
  });

  const resp = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: usdcAddress,
    callData: calldata,
    fee: { type: "level", config: { feeLevel: "HIGH" } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = (resp.data as any)?.transaction ?? (resp.data as any)?.contractExecution;
  const txHash = tx?.txHash ?? tx?.id ?? `dcw-pending-${opts.receiptId}`;
  const state: string = tx?.state ?? "INITIATED";

  return {
    txHash,
    status: state === "CONFIRMED" ? "confirmed" : "pending",
  };
}
