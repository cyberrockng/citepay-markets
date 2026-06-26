import { NextRequest, NextResponse } from "next/server";
import { getAllSources, updateSourceContent } from "@/lib/db";
import { fetchPageContent } from "@/lib/page-indexer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const key = process.env.REGISTER_API_KEY;
  if (key && req.headers.get("x-api-key") !== key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = getAllSources();
  const body = await req.json().catch(() => ({})) as { force?: boolean };
  const force = body.force === true;

  const results: { id: string; title: string; words: number; status: string }[] = [];

  for (const source of sources) {
    // Skip already-indexed unless forced
    if (source.fullContent && !force) {
      results.push({ id: source.id, title: source.title.slice(0, 40), words: source.fullContent.split(/\s+/).length, status: "skipped (already indexed)" });
      continue;
    }

    const { content, wordCount, error } = await fetchPageContent(source.url);
    if (content) {
      updateSourceContent(source.id, content);
      results.push({ id: source.id, title: source.title.slice(0, 40), words: wordCount, status: "indexed" });
    } else {
      results.push({ id: source.id, title: source.title.slice(0, 40), words: 0, status: `failed: ${error ?? "no content"}` });
    }

    // Small delay to avoid hammering external sites
    await new Promise(r => setTimeout(r, 500));
  }

  const indexed = results.filter(r => r.status === "indexed").length;
  return NextResponse.json({ indexed, total: sources.length, results });
}
