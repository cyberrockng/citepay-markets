import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "CitePay Markets — AI agents pay for what they cite.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0B0D12",
          color: "#F5F7FA",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          padding: 72,
          width: "100%",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 28,
            display: "flex",
            flexDirection: "column",
            gap: 34,
            height: "100%",
            justifyContent: "space-between",
            padding: 56,
            width: "100%",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: 20 }}>
            <div
              style={{
                alignItems: "center",
                background: "#171B24",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 18,
                color: "#34D399",
                display: "flex",
                fontSize: 28,
                fontWeight: 800,
                height: 72,
                justifyContent: "center",
                width: 72,
              }}
            >
              CP
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 34, fontWeight: 800 }}>CitePay Markets</div>
              <div style={{ color: "#A6ADBB", fontSize: 20 }}>Proof-of-paid-citation for AI agents</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ fontSize: 76, fontWeight: 800, letterSpacing: "-1px", lineHeight: 0.95 }}>
              AI agents pay for what they cite.
            </div>
            <div style={{ color: "#A6ADBB", fontSize: 28, lineHeight: 1.35, maxWidth: 880 }}>
              USDC citation payments with tamper-proof receipts, settled on Arc via Circle x402.
            </div>
          </div>

          <div style={{ alignItems: "center", color: "#34D399", display: "flex", fontSize: 24, fontWeight: 700, gap: 16 }}>
            <span>Live demo</span>
            <span style={{ color: "#6B7280" }}>•</span>
            <span>On-chain proof</span>
            <span style={{ color: "#6B7280" }}>•</span>
            <span>Creator payouts</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
