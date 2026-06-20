import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE = "https://citepay-markets.vercel.app";
const OUT = path.join(process.cwd(), "docs/screenshots");
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: "01-landing",  path: "/" },
  { name: "02-market",   path: "/market" },
  { name: "03-ask",      path: "/ask" },
  { name: "04-demo",     path: "/demo" },
  { name: "05-traction", path: "/traction" },
];

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });

  for (const page of PAGES) {
    const p = await ctx.newPage();
    console.log(`📸 ${page.name} …`);
    await p.goto(`${BASE}${page.path}`, { waitUntil: "networkidle", timeout: 30000 });
    await p.waitForTimeout(1500);
    await p.screenshot({
      path: path.join(OUT, `${page.name}.png`),
      fullPage: true,
    });
    console.log(`   ✓ saved ${page.name}.png`);
    await p.close();
  }

  // Receipt page — grab first receipt ID from the API
  try {
    const p = await ctx.newPage();
    const res = await p.request.get(`${BASE}/api/traction`);
    // hit market to seed DB, then grab a receipt
    await p.goto(`${BASE}/market`, { waitUntil: "networkidle" });
    const apiPage = await ctx.newPage();
    const resp = await apiPage.request.get(`${BASE}/api/sources`);
    const data = await resp.json() as { sources: Array<{ id: string }> };
    await apiPage.close();

    if (data.sources?.length) {
      // fetch receipts for first source
      const srcId = data.sources[0].id;
      const r2 = await p.request.get(`${BASE}/api/sources/${srcId}`);
      const r2data = await r2.json() as { receipts: Array<{ id: string }> };
      if (r2data.receipts?.length) {
        const receiptId = r2data.receipts[0].id;
        console.log(`📸 06-receipt (${receiptId.slice(0, 8)}) …`);
        await p.goto(`${BASE}/receipt/${receiptId}`, { waitUntil: "networkidle", timeout: 30000 });
        await p.waitForTimeout(1500);
        await p.screenshot({ path: path.join(OUT, "06-receipt.png"), fullPage: true });
        console.log("   ✓ saved 06-receipt.png");
      } else {
        console.log("   ⚠ no receipts yet — run /demo first then re-run screenshots");
      }
    }
    await p.close();
  } catch (e) {
    console.error("Receipt screenshot failed:", e);
  }

  await browser.close();
  console.log(`\n✓ All screenshots saved to docs/screenshots/`);
}

run().catch((e) => { console.error(e); process.exit(1); });
