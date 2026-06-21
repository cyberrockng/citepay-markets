import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`https://citepay-markets.vercel.app/api/receipt/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error("not found");
    const data = await res.json() as {
      receipt?: {
        sourceTitle?: string;
        decision?: string;
        amountPaid?: number;
        reason?: string;
        creatorName?: string;
      }
    };
    const r = data.receipt;
    if (!r) throw new Error("no receipt");

    const isPay = r.decision === "PAY";
    const amount = r.amountPaid ? `$${(r.amountPaid / 1_000_000).toFixed(4)} USDC` : "";
    const title = isPay
      ? `AI paid ${amount} to cite "${r.sourceTitle}" — CitePay Receipt`
      : `AI ${r.decision?.toLowerCase()} citing "${r.sourceTitle}" — CitePay Receipt`;
    const description = `${r.reason ?? ""} · Creator: ${r.creatorName ?? "unknown"} · Verified on Arc via Circle Gateway.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `https://citepay-markets.vercel.app/receipt/${id}`,
        type: "article",
      },
      twitter: {
        card: "summary",
        title,
        description,
      },
    };
  } catch {
    return {
      title: "CitePay Policy Receipt",
      description: "Public tamper-evident receipt for an AI citation decision settled on Arc via Circle Gateway.",
    };
  }
}

export default function ReceiptLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
