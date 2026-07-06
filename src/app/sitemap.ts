import type { MetadataRoute } from "next";

const BASE = "https://citepay-markets.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE,                    lastModified: new Date(), changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE}/ask`,           lastModified: new Date(), changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE}/register`,      lastModified: new Date(), changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE}/demo`,          lastModified: new Date(), changeFrequency: "weekly",  priority: 0.9 },
    { url: `${BASE}/mcp`,           lastModified: new Date(), changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE}/proof`,         lastModified: new Date(), changeFrequency: "always",  priority: 0.9 },
    { url: `${BASE}/audit`,         lastModified: new Date(), changeFrequency: "daily",   priority: 0.7 },
    { url: `${BASE}/market`,        lastModified: new Date(), changeFrequency: "daily",   priority: 0.7 },
    { url: `${BASE}/traction`,      lastModified: new Date(), changeFrequency: "daily",   priority: 0.5 },
    { url: `${BASE}/labs/agents`,   lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/labs/agent-exchange`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/labs/orchestrate`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/labs/economy`,  lastModified: new Date(), changeFrequency: "monthly", priority: 0.3 },
  ];
}
