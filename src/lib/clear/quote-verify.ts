export interface QuoteVerification {
  verified: boolean;
  quoteStart: number;
  quoteEnd: number;
}

interface IndexMapEntry {
  originalStart: number;
  originalEnd: number;
}

function normalizeWithMap(input: string): { normalized: string; indexMap: IndexMapEntry[] } {
  const normalizedParts: string[] = [];
  const indexMap: IndexMapEntry[] = [];
  let pendingSpace: IndexMapEntry | null = null;

  for (let i = 0; i < input.length; i++) {
    const originalChar = input[i];
    const normalized = originalChar.normalize("NFKC").toLowerCase();
    const isWhitespace = /\s/u.test(normalized);

    if (isWhitespace) {
      pendingSpace ??= { originalStart: i, originalEnd: i + 1 };
      pendingSpace.originalEnd = i + 1;
      continue;
    }

    if (pendingSpace && normalizedParts.length > 0) {
      normalizedParts.push(" ");
      indexMap.push(pendingSpace);
    }
    pendingSpace = null;

    for (const ch of normalized) {
      normalizedParts.push(ch);
      indexMap.push({ originalStart: i, originalEnd: i + 1 });
    }
  }

  return { normalized: normalizedParts.join("").trim(), indexMap };
}

export function verifyQuoteSpan(quote: string, sourceFullText: string): QuoteVerification {
  const cleanQuote = quote.trim();
  const cleanSource = sourceFullText.trim();
  if (!cleanQuote || !cleanSource) {
    return { verified: false, quoteStart: -1, quoteEnd: -1 };
  }

  const quoteNorm = normalizeWithMap(cleanQuote).normalized;
  const sourceNorm = normalizeWithMap(cleanSource);
  const start = sourceNorm.normalized.indexOf(quoteNorm);
  if (start < 0) {
    return { verified: false, quoteStart: -1, quoteEnd: -1 };
  }

  const end = start + quoteNorm.length - 1;
  const startMap = sourceNorm.indexMap[start];
  const endMap = sourceNorm.indexMap[end];
  if (!startMap || !endMap) {
    return { verified: false, quoteStart: -1, quoteEnd: -1 };
  }

  return {
    verified: true,
    quoteStart: startMap.originalStart,
    quoteEnd: endMap.originalEnd,
  };
}
