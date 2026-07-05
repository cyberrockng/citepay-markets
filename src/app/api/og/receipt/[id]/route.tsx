import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let sourceTitle = "Unknown Source";
  let amountPaid = 0;
  let decision = "PAY";
  let query = "";
  let contributionWeight: number | null = null;
  let txHash: string | null = null;

  try {
    const res = await fetch(`https://citepay-markets.vercel.app/api/receipt/${id}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json() as {
        receipt?: {
          sourceTitle?: string;
          amountPaid?: number;
          decision?: string;
          query?: string;
          contributionWeight?: number | null;
          txHash?: string | null;
        };
      };
      const r = data.receipt;
      if (r) {
        sourceTitle         = r.sourceTitle ?? sourceTitle;
        amountPaid          = r.amountPaid ?? 0;
        decision            = r.decision ?? "PAY";
        query               = r.query ?? "";
        contributionWeight  = r.contributionWeight ?? null;
        txHash              = r.txHash ?? null;
      }
    }
  } catch { /* fallback to defaults */ }

  const isPay = decision === "PAY";
  const amountUSD = (amountPaid / 1_000_000).toFixed(4);
  const vcs = contributionWeight != null ? Math.round(contributionWeight * 100) : null;
  const shortQuery = query.length > 72 ? query.slice(0, 69) + "…" : query;
  const shortTitle = sourceTitle.length > 52 ? sourceTitle.slice(0, 49) + "…" : sourceTitle;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "linear-gradient(135deg, #0a0a0f 0%, #0f0f1a 50%, #0a0f0a 100%)",
          display: "flex",
          flexDirection: "column",
          padding: "56px 64px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              background: isPay ? "rgba(52,211,153,0.15)" : "rgba(239,68,68,0.15)",
              border: `1px solid ${isPay ? "rgba(52,211,153,0.4)" : "rgba(239,68,68,0.4)"}`,
              borderRadius: "999px",
              padding: "6px 16px",
              color: isPay ? "#34D399" : "#ef4444",
              fontSize: "13px",
              fontWeight: "700",
              letterSpacing: "0.1em",
            }}>
              {isPay ? "✓ CITED BY AI" : `✗ ${decision}`}
            </div>
            {vcs != null && isPay && (
              <div style={{
                background: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.4)",
                borderRadius: "999px",
                padding: "6px 16px",
                color: "#a5b4fc",
                fontSize: "13px",
                fontWeight: "700",
              }}>
                VCS {vcs}%
              </div>
            )}
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px", letterSpacing: "0.05em" }}>
            CitePay Markets
          </div>
        </div>

        {/* Source title */}
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px", letterSpacing: "0.08em", marginBottom: "10px" }}>
          SOURCE
        </div>
        <div style={{
          color: "#f0f0f5",
          fontSize: "32px",
          fontWeight: "800",
          lineHeight: "1.2",
          marginBottom: "32px",
          maxWidth: "800px",
        }}>
          {shortTitle}
        </div>

        {/* Earnings — big */}
        {isPay && (
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "28px" }}>
            <div style={{
              color: "#34D399",
              fontSize: "80px",
              fontWeight: "900",
              lineHeight: "1",
              letterSpacing: "-0.02em",
            }}>
              ${amountUSD}
            </div>
            <div style={{ color: "rgba(52,211,153,0.5)", fontSize: "22px", fontWeight: "600" }}>
              USDC earned
            </div>
          </div>
        )}

        {/* Query */}
        {shortQuery && (
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "14px 20px",
            marginBottom: "auto",
            maxWidth: "900px",
          }}>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", letterSpacing: "0.1em", marginBottom: "6px" }}>
              QUERY
            </div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "16px", lineHeight: "1.4" }}>
              {shortQuery}
            </div>
          </div>
        )}

        {/* Bottom bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "24px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          marginTop: "24px",
        }}>
          <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34D399" }} />
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
                {txHash ? "On-chain verified · Arc Testnet" : "Verified receipt · Arc Testnet"}
              </span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "13px" }}>
              Receipt #{id.slice(0, 8)}
            </div>
          </div>
          <div style={{
            background: "rgba(52,211,153,0.1)",
            border: "1px solid rgba(52,211,153,0.2)",
            borderRadius: "8px",
            padding: "6px 14px",
            color: "#34D399",
            fontSize: "13px",
            fontWeight: "600",
          }}>
            citepay-markets.vercel.app
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
