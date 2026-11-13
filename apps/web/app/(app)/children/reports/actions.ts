"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { engineSend } from "@/lib/engine";

// CP-19's three acts on a report's lines, each a call to the engine in the signed-in person's name. The engine holds the rules (an
// educator of the child's class writes and gives the first approval, a coordinator gives the second, never the same person, a send
// only with consent and both approvals on every line, and nothing is delivered); a refusal comes back in its own words.
const UUID = /^[0-9a-f-]{36}$/;
const HERE = "/children/reports";

async function done(child: string, r: Response | null, ok: string): Promise<never> {
  revalidatePath(HERE);
  const said = r?.ok ? ok : ((await r?.json().catch(() => null)) as { detail?: string } | null)?.detail ?? "The engine is not answering. Nothing was changed.";
  redirect(`${HERE}?open=report:${child}&said=${encodeURIComponent(said)}`);
}

export async function saveLine(formData: FormData): Promise<void> {
  const me = await requireStaff();
  const [child, note, line] = ["child_id", "note_id", "line_id"].map((k) => String(formData.get(k) ?? ""));
  const words = String(formData.get("words") ?? "").trim();
  if (!UUID.test(child) || !UUID.test(note) || !UUID.test(line) || !words) redirect(HERE);
  // the line list is the whole report's lines: the others are sent back as they stand, this one with its new words
  const got = await engineSend("/reports/lines", { actor: me.email, note_id: note }).catch(() => null);
  const had = got?.ok ? ((await got.json()) as { lines: { id: string; words: string; evidence: string[] }[] }).lines : null;
  if (!had) return done(child, got, "");
  const lines = had.map((l) => ({ id: l.id, words: l.id === line ? words : l.words, evidence: l.evidence }));
  return done(child, await engineSend("/reports/lines/set", { actor: me.email, note_id: note, lines }).catch(() => null), "Saved. Its approvals, if any, are withdrawn.");
}

export async function approveLine(formData: FormData): Promise<void> {
  const me = await requireStaff();
  const [child, note, line] = ["child_id", "note_id", "line_id"].map((k) => String(formData.get(k) ?? ""));
  if (!UUID.test(child) || !UUID.test(note) || !UUID.test(line)) redirect(HERE);
  return done(child, await engineSend("/reports/lines/approve", { actor: me.email, note_id: note, line_id: line }).catch(() => null), "Approved.");
}

export async function sendReport(formData: FormData): Promise<void> {
  const me = await requireStaff();
  const [child, note] = ["child_id", "note_id"].map((k) => String(formData.get(k) ?? ""));
  if (!UUID.test(child) || !UUID.test(note)) redirect(HERE);
  return done(child, await engineSend("/reports/send", { actor: me.email, note_id: note }).catch(() => null), "Marked sent. Nothing was delivered to a parent.");
}
