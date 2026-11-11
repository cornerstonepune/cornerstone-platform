import type { FCell, FRow } from "@/components/fortnight-grid";
import { sql } from "./db";
import { shortDate } from "./educator/clock";
import { subjectLook, subjectLooks, type Fn } from "./timetable-ui";

// The draft the generator wrote (timetable_run, the engine's CP-11) for each class of a fortnight, read back as it was kept.
export type DraftEntry = { date: string; week: string; period_id: string; subject_code: string };
export type Unmet = { kind: string; id: string; words: string; exists: boolean };
export type Draft = {
  class_id: string;
  label: string;
  grade: string;
  section: string;
  outcome: "placed" | "unmeetable" | "not_found_in_time";
  needed: number;
  placed: number;
  at: string;
  entries: DraftEntry[];
  failed: string[];
  fet: string | null;
  unmet: Unmet[];
};

/** The latest kept draft of every class that has one for the fortnight. */
export async function draftsOf(fortnightId: string): Promise<Draft[]> {
  const rows = await sql<(Omit<Draft, "entries" | "failed" | "fet" | "unmet"> & { draft: DraftEntry[]; report: { failed?: string[]; fet?: string | null; rules?: { kind: string; id: string; words: string }[] } })[]>`
    select distinct on (r.school_class_id) r.school_class_id as class_id, c.label, c.grade_code as grade, c.section, r.outcome, r.needed, r.placed,
           r.created_at::text as at, r.draft, r.report
    from timetable_run r join school_class c on c.id = r.school_class_id
    where r.fortnight_id = ${fortnightId} order by r.school_class_id, r.created_at desc`;
  const ids = rows.flatMap((r) => (r.report.rules ?? []).map((x) => x.id));
  const known = new Set((ids.length ? await sql<{ id: string }[]>`select id::text as id from timetable_rule where id::text = any(${ids})` : []).map((r) => r.id));
  return rows
    .map(({ draft, report, ...r }) => ({ ...r, entries: draft ?? [], failed: report.failed ?? [], fet: report.fet ?? null, unmet: (report.rules ?? []).map((x) => ({ ...x, exists: known.has(x.id) })) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The draft as a grid: the fortnight's ten days across, the grade's lesson periods down, a cell where the generator put a lesson. */
export async function draftGrid(d: Draft, fn: Fn, href: (day: string, periodId: string) => string): Promise<{ days: string[]; labels: string[]; rows: FRow[]; cells: number }> {
  const periods = await sql<{ id: string; label: string; starts_at: string }[]>`
    select id, label, to_char(starts_at, 'HH24:MI') as starts_at from period where grade_code = ${d.grade} and not fixed order by starts_at`;
  const names = new Map((await sql<{ code: string; name: string }[]>`select code, coalesce(label, name) as name from subject`).map((s) => [s.code, s.name]));
  const looks = await subjectLooks();
  const all = Array.from({ length: 14 }, (_, i) => new Date(Date.parse(`${fn.starts_on}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)).filter((x) => ![0, 6].includes(new Date(`${x}T00:00:00Z`).getUTCDay()));
  const rows: FRow[] = periods.map((p) => ({
    time: `${p.starts_at} ${p.label}`,
    cells: all.map((day): FCell | null => {
      const e = d.entries.find((x) => x.date === day && x.period_id === p.id);
      return e ? { subject: subjectLook(looks, e.subject_code), activity: names.get(e.subject_code) ?? e.subject_code, href: href(day, p.id) } : null;
    }),
  }));
  return { days: all, labels: all.map(shortDate), rows, cells: d.entries.length };
}

/** What the draft reads for a class (the right-hand "What the draft reads"): the counts of the rows the generator is given. */
export async function draftReads(classId: string, grade: string, fortnightId: string): Promise<{ label: string; value: string; num: boolean }[]> {
  const [r] = await sql<{ periods: number; fixed: number; blocks: number; limits: number; plan: number }[]>`
    select (select count(*)::int from period where grade_code = ${grade} and not fixed) as periods,
           (select count(*)::int from timetable_rule where school_class_id = ${classId} and kind = 'frame' and cell = 'fixed') as fixed,
           (select count(*)::int from timetable_rule where school_class_id = ${classId} and kind = 'block') as blocks,
           (select count(*)::int from timetable_rule where school_class_id = ${classId} and kind = 'limit') as limits,
           (select count(*)::int from plan_entry where school_class_id = ${classId} and fortnight_id = ${fortnightId}) as plan`;
  return [
    { label: "Period times", value: `${r.periods} a day`, num: true },
    { label: "Fixed slots", value: String(r.fixed), num: true },
    { label: "Blocked days", value: String(r.blocks), num: true },
    { label: "Limits", value: String(r.limits), num: true },
    { label: "Plan lines", value: String(r.plan), num: true },
  ];
}
