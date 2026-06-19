/**
 * Creator payout module.
 * In production: Circle Programmable Wallets API.
 * In dev/demo: records payment proof and returns a simulated tx hash.
 */

export interface PaymentResult {
  txHash: string;
  amountMicroUsdc: number;
  recipient: string;
  status: "confirmed" | "simulated";
}

export async function payCreator(opts: {
  creatorWallet: string;
  amountMicroUsdc: number;
  sourceId: string;
  receiptId: string;
}): Promise<PaymentResult> {
  const { creatorWallet, amountMicroUsdc, sourceId, receiptId } = opts;

  // Production: Circle Programmable Wallets
  if (process.env.CIRCLE_API_KEY && process.env.CIRCLE_WALLET_ID) {
    try {
      const res = await fetch("https://api.circle.com/v1/w3s/developer/transactions/transfer", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.CIRCLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          walletId: process.env.CIRCLE_WALLET_ID,
          tokenId: process.env.USDC_TOKEN_ID || "usdc",
          destinationAddress: creatorWallet,
          amounts: [String(amountMicroUsdc / 1_000_000)],
          idempotencyKey: `citepay-${receiptId}`,
          fee: { type: "levels", config: { feeLevel: "MEDIUM" } },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        return {
          txHash: data.data?.transaction?.txHash || `circle-${receiptId}`,
          amountMicroUsdc,
          recipient: creatorWallet,
          status: "confirmed",
        };
      }
    } catch {
      // Fall through to simulation
    }
  }

  // Demo/dev: generate deterministic simulated tx hash
  const { sha256 } = await import("./evidence");
  const txHash = `0x${sha256(`${creatorWallet}:${amountMicroUsdc}:${receiptId}:${sourceId}`)}`;

  return {
    txHash,
    amountMicroUsdc,
    recipient: creatorWallet,
    status: "simulated",
  };
}
