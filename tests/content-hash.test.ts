import { describe, expect, it } from "vitest";
import { fetchAndHash } from "../src/lib/content-hash";

describe("fetchAndHash — SSRF protection", () => {
  it("fails open (never throws) when the target resolves to a loopback address", async () => {
    const result = await fetchAndHash("https://localhost/whatever");
    expect(result.source).toBe("fallback");
    expect(result.error).toMatch(/non-public address/);
    expect(result.contentLength).toBe(0);
    expect(result.hash).toHaveLength(64);
  });

  it("fails open on a non-http(s) URL without throwing", async () => {
    const result = await fetchAndHash("ftp://example.com/file");
    expect(result.source).toBe("fallback");
    expect(result.hash).toHaveLength(64);
  });
});
