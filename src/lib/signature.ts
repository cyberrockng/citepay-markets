import { ethers } from "ethers";

export async function signReceiptHash(evidenceHash: string): Promise<string | null> {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) return null;
  try {
    const wallet = new ethers.Wallet(privateKey);
    return await wallet.signMessage(evidenceHash);
  } catch {
    return null;
  }
}

export function verifyReceiptSignature(evidenceHash: string, signature: string): string {
  return ethers.verifyMessage(evidenceHash, signature);
}
