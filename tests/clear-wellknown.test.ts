import { describe, expect, it } from "vitest";
import {
  extractHostname,
  fetchWellKnownPolicy,
  isBlockedIp,
  resolvePublisherLicense,
  validatePolicy,
} from "../src/lib/clear/wellknown";

describe("isBlockedIp — SSRF address guard", () => {
  it("blocks private, loopback, link-local, and CGNAT IPv4 ranges", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it("blocks loopback, link-local, and unique-local IPv6 ranges", () => {
    for (const ip of ["::1", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it("allows real public IPv4 and IPv6 addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });

  it("blocks garbage that isn't a resolvable IP literal", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });
});

describe("extractHostname", () => {
  it("accepts a bare domain and an explicit https URL", () => {
    expect(extractHostname("example.com")).toBe("example.com");
    expect(extractHostname("https://example.com/path?x=1")).toBe("example.com");
  });

  it("rejects http (non-https) and malformed input", () => {
    expect(extractHostname("http://example.com")).toBeNull();
    expect(extractHostname("not a url at all ://")).toBeNull();
  });
});

describe("validatePolicy — citepay.json schema", () => {
  const VALID = {
    version: 1,
    licenseClass: "standard",
    pricePerCitationMicro: 10_000,
    payoutAddress: "0x5389688243328c26a92b301faEEAb5fbf9AFf105",
    contact: "mailto:hello@example.com",
  };

  it("accepts a well-formed policy and normalizes optional contact", () => {
    expect(validatePolicy(VALID)).toEqual(VALID);
    expect(validatePolicy({ ...VALID, contact: undefined })).toEqual({ ...VALID, contact: null });
  });

  it("rejects wrong version, bad address, out-of-range price, and missing licenseClass", () => {
    expect(validatePolicy({ ...VALID, version: 2 })).toBeNull();
    expect(validatePolicy({ ...VALID, payoutAddress: "not-an-address" })).toBeNull();
    expect(validatePolicy({ ...VALID, pricePerCitationMicro: -1 })).toBeNull();
    expect(validatePolicy({ ...VALID, pricePerCitationMicro: 1.5 })).toBeNull();
    expect(validatePolicy({ ...VALID, licenseClass: "" })).toBeNull();
    expect(validatePolicy(null)).toBeNull();
    expect(validatePolicy("a string")).toBeNull();
  });
});

describe("resolvePublisherLicense", () => {
  const POLICY = {
    version: 1 as const,
    licenseClass: "open",
    pricePerCitationMicro: 5_000,
    payoutAddress: "0x5389688243328c26a92b301faEEAb5fbf9AFf105",
    contact: null,
  };

  it("uses the well-known policy only when the payout address matches", () => {
    const result = resolvePublisherLicense({ ok: true, policy: POLICY }, "standard", "0x5389688243328c26a92b301faEEAb5fbf9AFf105");
    expect(result).toEqual({ licenseClass: "open", verificationStatus: "domain_verified" });
  });

  it("is case-insensitive on the payout address comparison", () => {
    const result = resolvePublisherLicense({ ok: true, policy: POLICY }, "standard", "0x5389688243328C26A92B301FAEEAB5FBF9AFF105");
    expect(result.verificationStatus).toBe("domain_verified");
  });

  it("falls back to self-declared license when the payout address mismatches", () => {
    const result = resolvePublisherLicense({ ok: true, policy: POLICY }, "standard", "0x0000000000000000000000000000000000dEaD");
    expect(result).toEqual({ licenseClass: "standard", verificationStatus: "unverified" });
  });

  it("falls back to self-declared license when no well-known file was found", () => {
    const result = resolvePublisherLicense({ ok: false, error: "No DNS records" }, "standard", "0x5389688243328c26a92b301faEEAb5fbf9AFf105");
    expect(result).toEqual({ licenseClass: "standard", verificationStatus: "unverified" });
  });
});

describe("fetchWellKnownPolicy — end-to-end SSRF rejection", () => {
  it("rejects a target that resolves to a loopback address, with no mocking required", async () => {
    const result = await fetchWellKnownPolicy("https://localhost");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/non-public address/);
  });

  it("rejects a non-https input outright before any network activity", async () => {
    const result = await fetchWellKnownPolicy("ftp://example.com");
    expect(result).toEqual({ ok: false, error: "Could not determine an https hostname." });
  });
});
