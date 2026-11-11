"use server";

import { requireStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import { EngineDown, engineSend } from "@/lib/engine";
import { schoolZone } from "@/lib/school-clock";
import { voiceOn } from "@/lib/voice";
import { outcomeWords } from "@/components/outcome-states";
import { staffList } from "@/lib/queries";
import type { Seen } from "@/components/timeline";

// The history under a child in ChildPeek (SPEC §5): what was observed, what evidence stands and the papers given, newest first,
// each with who and when. The engine's POST /k2/child-history answers codes and ids only (a note's words stay private); the words
// come from the school's rows here: outcomes, activity names, staff names. Only a person who may read the class gets an answer.
type Entry = { kind: "observation" | "evidence" | "paper"; at: string; who: string | null; what: Record<string, string | null> };

const whenIn = (zone: string) => (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: zone, day: "numeric", month: "short" }).replace(" ", "-");

export async function peekHistory(classId: string, roll: string): Promise<Seen[]> {
  const me = await requireStaff();
  if (!(await voiceOn())) return [];
  let res: Response;
  try {
    res = await engineSend("/k2/child-history", { actor: me.email, class_id: classId, roll_no: roll, limit: 30 });
  } catch (e) {
    if (e instanceof EngineDown) return [];
    throw e;
  }
  if (!res.ok) return [];
  const { entries } = (await res.json()) as { entries: Entry[] };
  const when = whenIn(await schoolZone());
  const staff = [...new Set(entries.flatMap((e) => (e.who ? [e.who] : [])))];
  // the website's role may not read `pii.staff` or run `pii.read_staff` (the engine's only): a name is read from the staff list the website
  // already asks for, by id, and only for those the history names
  const listed = staff.length ? new Map((await staffList()).flatMap((s) => (s.id ? [[s.id, s.name] as const] : []))) : new Map<string, string>();
  const names = Object.fromEntries(staff.map((id) => [id, listed.get(id) ?? ""]));
  const codes = [...new Set(entries.flatMap((e) => (e.what.activity ? [e.what.activity] : [])))];
  const acts = codes.length ? Object.fromEntries((await sql<{ code: string; name: string }[]>`select code, name from activity where code = any(${codes}::text[])`).map((r) => [r.code, r.name])) : {};
  return entries.map((e): Seen => {
    const by = e.who && names[e.who] ? names[e.who] : "not recorded";
    if (e.kind === "observation") return { kind: "activity", title: `${acts[e.what.activity ?? ""] ?? e.what.activity}: ${outcomeWords(e.what.outcome ?? "")}`, line: `Observed · ${by}`, when: when(e.at) };
    if (e.kind === "evidence") return { kind: "skill", title: `${e.what.skill}: ${e.what.mark}`, line: `${e.what.source ?? "Evidence"} · ${by}`, when: when(e.at) };
    return { kind: "assessment", title: `Paper ${e.what.qr ?? ""}`.trim(), line: `${e.what.kind ?? "Paper"}${e.what.status ? ` · ${e.what.status}` : ""} · ${by}`, when: when(e.at) };
  });
}
