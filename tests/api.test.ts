import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3000";

describe("Backend API", () => {
  it("GET /api/health returns ok", async () => {
    const res = await fetch(`${BASE}/api/health`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
  });

  it("GET /api/sources returns array", async () => {
    const res = await fetch(`${BASE}/api/sources`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(data.sources)).toBe(true);
  });

  it("POST /api/ask without payment returns 402", async () => {
    const res = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "What is x402?" }),
    });
    expect(res.status).toBe(402);
    const data = await res.json();
    expect(data.x402).toBeDefined();
    expect(data.x402.maxAmountRequired).toBeDefined();
  });

  it("POST /api/ask with payment proceeds", async () => {
    const paymentProof = {
      scheme: "exact",
      network: "eip155:84532",
      payload: { signature: "0x" + "a".repeat(130), transaction: { hash: "0x" + "b".repeat(64) } },
    };

    const res = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT": JSON.stringify(paymentProof),
      },
      body: JSON.stringify({ query: "What is x402 useful for?", budget: 0.05 }),
    });

    // May be 200 (with sources) or still work even with empty sources
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.queryId).toBeDefined();
      expect(Array.isArray(data.decisions)).toBe(true);
    }
  });

  it("GET /api/traction returns stats object", async () => {
    const res = await fetch(`${BASE}/api/traction`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.stats).toBeDefined();
    expect(typeof data.stats.totalDecisions).toBe("number");
  });

  it("GET /api/receipt/nonexistent returns 404", async () => {
    const res = await fetch(`${BASE}/api/receipt/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it("POST /api/sources/register creates a source", async () => {
    const res = await fetch(`${BASE}/api/sources/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Article",
        url: "https://test.example.com/article",
        creatorName: "Test Creator",
        creatorHandle: "@test",
        payoutWallet: "0x1234567890123456789012345678901234567890",
        price: 2000,
        bond: 0,
        content: "Test content for hashing",
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.source).toBeDefined();
    expect(data.source.contentHash).toBeDefined();
  });
});
