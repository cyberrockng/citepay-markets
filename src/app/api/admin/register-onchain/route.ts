import { NextRequest, NextResponse } from "next/server";
import { getAllSources, updateSourceOnChainId } from "@/lib/db";
import { registerSourceOnChain } from "@/lib/anchor";

export const dynamic = "force-dynamic";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export async function POST(req: NextRequest) {
  // Gate: require ADMIN_SECRET header
  const secret = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = getAllSources().filter((s) => !s.onChainId);
  if (sources.length === 0) {
    return NextResponse.json({ message: "All sources already registered on-chain", registered: 0 });
  }

  const results: Array<{ id: string; title: string; onChainId: number | null; error?: string }> = [];

  for (const s of sources) {
    try {
      const onChainId = await registerSourceOnChain({
        payoutWallet: s.payoutWallet,
        contentHash: s.contentHash,
        metadataURI: s.url,
        price: s.price,
      });
      if (onChainId) {
        updateSourceOnChainId(s.id, onChainId);
        results.push({ id: s.id, title: s.title, onChainId });
      } else {
        results.push({ id: s.id, title: s.title, onChainId: null, error: "registerSourceOnChain returned null" });
      }
    } catch (err) {
      results.push({ id: s.id, title: s.title, onChainId: null, error: String(err) });
    }
  }

  const ok = results.filter((r) => r.onChainId !== null).length;
  return NextResponse.json({ registered: ok, total: sources.length, results });
}
