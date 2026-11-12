import { kindWords } from "@/components/question";

/** "3 column sums · 3 word problems" — what a worksheet holds, by kind, in words. */
export function kindsInWords(kinds: Record<string, number> | null, words: Record<string, string>): string {
  return Object.entries(kinds ?? {})
    .map(([fmt, n]) => `${n} ${kindWords(words, fmt)}`)
    .join(" · ");
}
