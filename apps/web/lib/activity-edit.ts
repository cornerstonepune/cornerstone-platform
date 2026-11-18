// What a coordinator needs to edit an activity where it is shown (CP-70, specs/CP-70/spec.md): the grades it is tagged to and the ones it
// can be added to, the objectives and skills it can be tied to, and what has been changed on it, in plain words, with whether one change can
// be taken back. Server only. Nothing here decides who may edit or what an undo does: the engine does (`w1_bank/curriculum_edit.py`).
import { curriculumTree } from "./curriculum-cache";
import { sql } from "./db";
import { engineSend } from "./engine";
import { staffList } from "./queries";
import { schoolZone } from "./school-clock";

export type Named = { code: string; name: string };
/** Something that can be tied to the activity, under the heading it is offered under. */
export type Choice = Named & { group: string };
export type Change = { id: string; when: string; who: string; what: string; from: string; to: string; undo: boolean };
export type ActivityEdit = { grades: Named[]; addable: Named[]; objectives: Choice[]; skills: Choice[]; changes: Change[]; earlier: number };

/** The newest few are what a person takes back; the rest are counted (rule 3 of docs/ux-rules.md allows ten at most). */
const SHOWN = 5;
const WORDS = 90;
// the engine's ACTIVITY_FIELDS and grades: what `undo` puts back on an activity
const UNDOABLE = new Set(["name", "steps", "materials", "level_0", "level_1", "level_2", "level_3", "band", "also_bands"]);
const FIELD: Record<string, string> = { name: "Name", steps: "Steps", materials: "Materials", objective: "What the child learns", thinking: "How to think about it", strand: "Strand", sheet_no: "Sheet number" };
const LINK: Record<string, { word: string; key: string }> = { activity_skill: { word: "Skill", key: "skill_code" }, activity_objective: { word: "Objective", key: "lo_code" } };

type Entry = { id: string; at: string; staff_id: string | null; what: string; before: unknown; after: unknown; op: string; table: string };

const short = (v: unknown) => {
  const s = (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v)).replace(/\s+/g, " ").trim();
  return s.length > WORDS ? `${s.slice(0, WORDS).trimEnd()}…` : s;
};
const fieldWord = (k: string) => FIELD[k] ?? (/^level_[0-3]$/.test(k) ? `Level ${k.slice(-1)}` : k);
/** The grades a change of `band` or `also_bands` names, on one side of it. */
const gradesIn = (v: unknown, key: string): string[] => {
  const all = Array.isArray(v) || typeof v === "string" ? { [key]: v } : ((v ?? {}) as Record<string, unknown>);
  return [all.band, ...(Array.isArray(all.also_bands) ? all.also_bands : [])].filter((g): g is string => typeof g === "string" && g !== "");
};

export async function activityEdit(me: { email: string }, code: string, tied: { objectives: string[]; skills: string[] }): Promise<ActivityEdit> {
  const [row] = await sql<{ band: string | null; also_bands: string[]; listed: boolean }[]>`
    select a.band, a.also_bands, exists (select 1 from activity_material m where m.tenant_id = a.tenant_id and m.activity_code = a.code) as listed
    from activity a where a.code = ${code}`;
  const [tree, names, skills, res] = await Promise.all([
    curriculumTree(),
    sql<Named[]>`select code, name from grade order by ord`,
    sql<Choice[]>`select code, name, coalesce(nullif(domain_name, ''), domain) as "group" from registry_skill order by 3, name`,
    engineSend("/curriculum/edit/history", { actor: me.email, kind: "activity", code }),
  ]);
  const gradeName = (g: string) => names.find((n) => n.code === g)?.name ?? g;
  const mine = [row?.band, ...(row?.also_bands ?? [])].filter((g): g is string => !!g);
  // an objective is offered from the grades the activity is in: the tree's own leaves, under their subject and unit
  const objectives = tree
    .filter((g) => mine.includes(g.code))
    .flatMap((g) => g.leaves.map((l) => ({ code: l.code, name: l.title, group: [g.name, g.subjects.find((s) => s.key === l.subject)?.name, l.unit].filter(Boolean).join(" · ") })))
    .filter((o, i, all) => !tied.objectives.includes(o.code) && all.findIndex((x) => x.code === o.code) === i);
  const entries = res.ok ? ((await res.json()) as { history: Entry[] }).history : [];
  return {
    grades: mine.map((g) => ({ code: g, name: gradeName(g) })),
    addable: tree.filter((g) => !mine.includes(g.code)).map((g) => ({ code: g.code, name: g.name })),
    objectives,
    skills: skills.filter((s) => !tied.skills.includes(s.code)),
    changes: await inWords(entries.slice(0, SHOWN), entries, gradeName, !!row?.listed),
    earlier: Math.max(0, entries.length - SHOWN),
  };
}

/** Each change as a person reads it. Undo is offered on a person's change that nothing later touched (the engine refuses the rest anyway). */
async function inWords(shown: Entry[], all: Entry[], gradeName: (g: string) => string, materialsListed: boolean): Promise<Change[]> {
  const tiedCodes = (table: string) => shown.filter((e) => e.table === table).flatMap((e) => [e.before, e.after]).filter((c): c is string => typeof c === "string");
  const [zone, los, sks, staff] = await Promise.all([
    schoolZone(),
    sql<Named[]>`select code, title as name from learning_objective where code = any(${tiedCodes("activity_objective")})`,
    sql<Named[]>`select code, name from registry_skill where code = any(${tiedCodes("activity_skill")})`,
    staffList(),
  ]);
  const named = (table: string, c: unknown) => (table === "activity_objective" ? los : sks).find((n) => n.code === c)?.name ?? String(c ?? "");
  const touched = new Set<string>(); // newest first: what a later change already touched
  return all.flatMap((e, i): Change[] => {
    const link = LINK[e.table];
    const keys = link ? [`${e.table} ${String(e.after ?? e.before)}`] : e.what.split(", ");
    const later = keys.some((k) => touched.has(k));
    for (const k of keys) touched.add(k);
    if (i >= shown.length) return [];
    const base = { id: e.id, when: new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: zone }), who: e.staff_id ? (staff.find((s) => s.id === e.staff_id)?.name ?? "A member of staff") : "The system" };
    if (link) {
      const tie = e.op === "insert" ? "tied" : e.op === "delete" ? "untied" : "kept as a person's";
      return [{ ...base, what: `${link.word} ${tie}`, from: "", to: named(e.table, e.after ?? e.before), undo: !!e.staff_id && !later && e.op !== "update" }];
    }
    if (keys.every((k) => k === "band" || k === "also_bands")) {
      const was = gradesIn(e.before, keys[0]);
      const now = gradesIn(e.after, keys[0]);
      const added = now.filter((g) => !was.includes(g)).map(gradeName);
      const gone = was.filter((g) => !now.includes(g)).map(gradeName);
      const what = added.length && !gone.length ? "Grade added" : gone.length && !added.length ? "Grade removed" : "Grades changed";
      return [{ ...base, what, from: gone.join(", "), to: added.join(", "), undo: !!e.staff_id && !later }];
    }
    if (e.op === "insert") return [{ ...base, what: "Activity added", from: "", to: "", undo: false }];
    const can = !!e.staff_id && !later && keys.every((k) => UNDOABLE.has(k)) && !(materialsListed && keys.includes("materials"));
    return [{ ...base, what: keys.map(fieldWord).join(", "), from: keys.length === 1 ? short(e.before) : "", to: keys.length === 1 ? short(e.after) : "", undo: can }];
  });
}
