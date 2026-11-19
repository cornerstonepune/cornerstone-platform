// What waits on a person in Money (CP-80, specs/CP-80/spec.md): the engine's `/money/access` and `/money/queue`, read once for each request, and the
// words a decision's refusal comes back in. Nothing is decided here: who may approve or pay, and by which rules, is the engine's.
import { cache } from "react";
import { EngineDown, engineSend } from "./engine";
import type { Session } from "./auth";
import type { MoneyAccess, Waiting } from "./money-format";

/** One read: the engine's answer, or why there is none in words a person can read (the engine could not be reached, or refused). */
export type Got<T> = { ok: true; value: T } | { ok: false; words: string };

/** The words of an engine refusal, as it sends them (`{"detail": "words"}`), else a plain sentence that says nothing was changed. */
export async function said(res: Response): Promise<string> {
  try {
    const detail = ((await res.json()) as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  } catch {
    // an answer with no words of its own: said below
  }
  return `The engine did not accept that (${res.status}). Nothing was changed.`;
}

async function ask<T>(path: "/money/access" | "/money/queue", email: string): Promise<Got<T>> {
  try {
    const res = await engineSend(path, { actor: email });
    return res.ok ? { ok: true, value: (await res.json()) as T } : { ok: false, words: await said(res) };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, words: e.message };
    throw e;
  }
}

/** What this person may do in Money, the campuses they act for, and how many claims wait on them. */
export const moneyAccess = cache((me: Session) => ask<MoneyAccess>("/money/access", me.email));

/** The claims this person may approve now, and the approved ones they may pay now, each oldest first, with who filed it. */
export const moneyQueue = cache((me: Session) => ask<{ approve: Waiting[]; pay: Waiting[] }>("/money/queue", me.email));

/** Which list a screen works through, and where it lives. */
export const QUEUES = {
  approve: { path: "/money/approve", empty: "Nothing is waiting for you." },
  pay: { path: "/money/pay", empty: "Nothing is waiting to be paid." },
} as const;
export type Queue = keyof typeof QUEUES;

/** A queue's address, with the claim to open and the one line to say (`did`: what was just done; `said`: why it was refused). */
export function queueAt(queue: Queue, o: { open?: string | null; page?: number; did?: string; said?: string } = {}): string {
  const p = new URLSearchParams();
  if (o.open) p.set("open", `claim:${o.open}`);
  if (o.page && o.page > 1) p.set("page", String(o.page));
  if (o.did) p.set("did", o.did);
  if (o.said) p.set("said", o.said);
  const s = p.toString();
  return s ? `${QUEUES[queue].path}?${s}` : QUEUES[queue].path;
}

/** The claim to open after one was decided: the one that followed it when the page was drawn (`hint`) if it still waits, else the first that waits. */
export function afterDecision(waiting: readonly Pick<Waiting, "id">[], hint: string): string | null {
  return waiting.find((c) => c.id === hint)?.id ?? waiting[0]?.id ?? null;
}

/** A date as the school says it: "10 Nov 2026" (from `YYYY-MM-DD`, read as written, never shifted by a time zone). */
export function dayWords(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
