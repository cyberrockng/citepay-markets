import { agentEvents, type AgentDecisionEvent } from "@/lib/events";
import { getAllReceipts } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  let handler: ((ev: AgentDecisionEvent) => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Seed with last 10 receipts so the page isn't empty on first load
      try {
        const recent = getAllReceipts(10).reverse();
        for (const r of recent) {
          const ev: AgentDecisionEvent = {
            decision: r.decision,
            sourceTitle: r.sourceTitle,
            amountPaid: r.amountPaid,
            evidenceHash: r.evidenceHash,
            query: r.query,
            timestamp: r.createdAt,
            historical: true,
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
      } catch {
        // DB not available on this cold start yet — skip history
      }

      // Heartbeat keeps the connection alive through proxies and Vercel
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, 25_000);

      handler = (ev: AgentDecisionEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          agentEvents.off("decision", handler!);
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      };
      agentEvents.on("decision", handler);
    },
    cancel() {
      if (handler) agentEvents.off("decision", handler);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
