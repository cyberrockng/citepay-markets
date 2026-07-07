import type { Source } from "@/types";

export function sourceText(source: Source): string {
  const text = source.fullContent || source.description || `${source.title}. ${source.url}`;
  return text.length >= 80
    ? text
    : `${text} CitePay Clear uses exact quote verification before creator payment can execute.`;
}
