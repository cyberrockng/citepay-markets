import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const base = "https://citepay-markets.vercel.app";

  try {
    const res = await fetch(`${base}/api/receipt/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error("not found");
    const data = await res.json() as {
      receipt?: {
        sourceTitle?: string;
        decision?: string;
        amountPaid?: number;
        reason?: string;
        query?: string;
      };
    };
    const r = data.receipt;
    if (!r) throw new Error("no receipt");

    const isPay = r.decision === "PAY";
    const amount = r.amountPaid ? `$${(r.amountPaid / 1_000_000).toFixed(4)} USDC` : "";
    const title = isPay
      ? `AI paid ${amount} to cite "${r.sourceTitle}"`
      : `AI skipped citing "${r.sourceTitle}"`;
    const description = isPay
      ? `${r.reason ?? "High relevance source"}. Verified on Arc Testnet via CitePay Markets.`
      : `${r.reason ?? "Source did not meet citation threshold."}`;

    const ogImage = `${base}/api/og/receipt/${id}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `${base}/receipt/${id}`,
        type: "article",
        images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [ogImage],
      },
    };
  } catch {
    return {
      title: "CitePay Receipt",
      description: "Public tamper-evident receipt for an AI citation decision on Arc Testnet.",
    };
  }
}

export default function ReceiptLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
