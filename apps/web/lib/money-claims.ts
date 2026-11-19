import type { Session } from "@/lib/auth";
import { engineSend } from "@/lib/engine";
import type { Claim } from "@/lib/money-format";

// A person's own claims and the form's lists, from the engine (`/money/claims/mine`, `/money/form`). Nothing is decided here: the words
// of every refusal are the engine's, and a claim is shown as the engine sends it.
export type ClaimForm = { categories: string[]; subcategories: Record<string, string[]>; campuses: string[]; today: string };
export type Field = "bill" | "amount" | "spent_on" | "vendor" | "category" | "subcategory" | "campus";

/** The words of a refused call: the engine's own, or `fallback` when it gave none. */
export async function engineWords(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
  return typeof body?.detail === "string" ? body.detail : fallback;
}

/** The field a refusal is about, so its words stand beside it; none for a refusal about the claim as a whole. */
export function fieldOf(words: string): Field | null {
  const says: [RegExp, Field][] = [
    [/amount/i, "amount"],
    [/date/i, "spent_on"],
    [/who was paid/i, "vendor"],
    [/not offered under/i, "subcategory"],
    [/categor/i, "category"],
    [/campus/i, "campus"],
    [/bill/i, "bill"],
  ];
  return says.find(([re]) => re.test(words))?.[1] ?? null;
}

export async function myClaims(me: Session): Promise<Claim[] | null> {
  try {
    const res = await engineSend("/money/claims/mine", { actor: me.email });
    return res.ok ? ((await res.json()) as { claims: Claim[] }).claims : null;
  } catch {
    return null;
  }
}

export async function claimForm(me: Session): Promise<ClaimForm | null> {
  try {
    const res = await engineSend("/money/form", { actor: me.email });
    return res.ok ? ((await res.json()) as ClaimForm) : null;
  } catch {
    return null;
  }
}

/** The file ending a bill's type was kept under (the engine tells the type back, the ending it takes). */
export const EXT_OF: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "application/pdf": ".pdf" };

/** A date as the school writes it in a list: "12 Nov 2026". */
export const dayWords = (iso: string): string => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
