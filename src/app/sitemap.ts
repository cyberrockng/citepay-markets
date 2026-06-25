import type { MetadataRoute } from "next";

const BASE = "https://citepay-markets.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE,                    lastModified: new Date(), changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE}/ask`,           lastModified: new Date(), changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE}/register`,      lastModified: new Date(), changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE}/orchestrate`,   lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE}/mcp`,           lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE}/proof`,         lastModified: new Date(), changeFrequency: "always",  priority: 0.9 },
    { url: `${BASE}/audit`,         lastModified: new Date(), changeFrequency: "daily",   priority: 0.7 },
    { url: `${BASE}/market`,        lastModified: new Date(), changeFrequency: "daily",   priority: 0.7 },
    { url: `${BASE}/leaderboard`,   lastModified: new Date(), changeFrequency: "daily",   priority: 0.6 },
    { url: `${BASE}/bounties`,       lastModified: new Date(), changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE}/session`,        lastModified: new Date(), changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE}/policy`,         lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE}/intelligence`,   lastModified: new Date(), changeFrequency: "always",  priority: 0.8 },
    { url: `${BASE}/auction`,        lastModified: new Date(), changeFrequency: "weekly",  priority: 0.7 },
    { url: `${BASE}/live`,          lastModified: new Date(), changeFrequency: "always",  priority: 0.6 },
    { url: `${BASE}/traction`,      lastModified: new Date(), changeFrequency: "daily",   priority: 0.5 },
  ];
}
