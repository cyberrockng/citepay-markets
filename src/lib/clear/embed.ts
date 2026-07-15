function cleanBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function clearBadgePath(clearanceId: string): string {
  return `/api/clear/${encodeURIComponent(clearanceId)}/badge`;
}

export function clearBadgeUrl(baseUrl: string, clearanceId: string): string {
  return `${cleanBaseUrl(baseUrl)}${clearBadgePath(clearanceId)}`;
}

export function clearReceiptUrl(baseUrl: string, clearanceId: string): string {
  return `${cleanBaseUrl(baseUrl)}/clearance/${encodeURIComponent(clearanceId)}`;
}

export function clearBadgeEmbedSnippet(baseUrl: string, clearanceId: string): string {
  return `<a href="${clearReceiptUrl(baseUrl, clearanceId)}"><img alt="CitePay clearance badge" src="${clearBadgeUrl(baseUrl, clearanceId)}" /></a>`;
}
