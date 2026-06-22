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

  // Response shape: { data: { id: string, state: TransactionState } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txData = resp.data as any;
  const txId: string = txData?.id ?? txData?.transaction?.id ?? "";
  let txHash: string = txData?.txHash ?? txData?.transaction?.txHash ?? `dcw-pending-${opts.receiptId}`;
  let state: string = txData?.state ?? txData?.transaction?.state ?? "INITIATED";

  console.log(`[dcw] tx submitted id=${txId} state=${state}`);

  // Arc Testnet has sub-500ms finality — poll for CONFIRMED or COMPLETE (max 15s)
  if (txId && state !== "CONFIRMED" && state !== "COMPLETE" && state !== "FAILED") {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poll = (await client.getTransaction({ id: txId })) as any;
        const polled = poll?.data?.transaction;
        const prev = state;
        if (polled?.state) state = polled.state;
        if (polled?.txHash) txHash = polled.txHash;
        if (state !== prev) console.log(`[dcw] poll ${i + 1} state=${state} txHash=${txHash}`);
        if (state === "CONFIRMED" || state === "COMPLETE" || state === "FAILED" || state === "CANCELLED") break;
      } catch (e) { console.log(`[dcw] poll err`, String(e)); break; }
    }
  }

  console.log(`[dcw] done state=${state} txHash=${txHash}`);
  return {
    txHash,
    status: (state === "CONFIRMED" || state === "COMPLETE") ? "confirmed" : "pending",
  };
}
