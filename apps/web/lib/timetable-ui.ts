import { cache } from "react";
import { sql } from "./db";
import { stateWords } from "./fortnight-words";
import { EngineDown, engineSend } from "./engine";
import type { Subject } from "@/components/period-row";

// What the timetable screens read and the one rule about who may act (UI-6, docs/frontend/SPEC.md "Timetable").
// Nothing is decided here: the clashes, moves and states are the engine's and the database's; this reads them.

/** The coordinator is the member of staff whose access group gives every staff row (the same test as `requireStaffEditor`). */
export const isCoordinator = cache(async (): Promise<boolean> => {
  const [r] = await sql<{ all: boolean }[]>`select public.my_reach('staff') = 'all' as all`;
  return r?.all === true;
});

export type Fn = { id: string; number: number; starts_on: string; ends_on: string; state: string };

// a function, not a constant: a query built at import would ask for the database while the site is being built
const FN = () => sql`select f.id, f.number, f.starts_on::text as starts_on, f.ends_on::text as ends_on, f.state
  from fortnight f where f.kind = 'teaching'`;

/** The teaching fortnight holding `day`, or the first one after it when none does (a holiday between). */
export async function fortnightAt(day: string, classId?: string): Promise<Fn | null> {
  // a class belongs to one academic year, so a named class keeps the fortnight in its own year
  const mine = classId && /^[0-9a-f-]{36}$/i.test(classId) ? sql`and f.academic_year_id = (select academic_year_id from school_class where id = ${classId})` : sql``;
  const [r] = await sql<Fn[]>`${FN()} ${mine} and f.ends_on >= ${day}::date order by f.starts_on limit 1`;
  return r ?? null;
}
export async function fortnightAfter(f: Fn): Promise<Fn | null> {
  const [r] = await sql<Fn[]>`${FN()} and f.starts_on > ${f.starts_on}::date order by f.starts_on limit 1`;
  return r ?? null;
}
export async function fortnightNumber(n: number): Promise<Fn | null> {
  const [r] = await sql<Fn[]>`${FN()} and f.number = ${n} limit 1`;
  return r ?? null;
}

/** The three subject colours the grid has, by subject: the school's own row (config `timetable.subject_looks`, a subject's
 *  code to "numeracy", "language" or "arts"). A subject with no entry is drawn as arts, so no code here names a subject. */
export type Looks = Record<string, Exclude<Subject, "fixed">>;
export const subjectLooks = cache(async (): Promise<Looks> => {
  const [r] = await sql<{ value: Looks }[]>`select value from config where key = 'timetable.subject_looks'`;
  return r?.value && typeof r.value === "object" ? r.value : {};
});
export const subjectLook = (looks: Looks, code: string | null): Exclude<Subject, "fixed"> => (code && looks[code]) || "arts";

export type FnRow = Fn & { moves: number };
/** Every teaching fortnight of the academic year `f` belongs to, oldest first, each with how many hand moves it has had. */
export async function fortnightsOfYear(f: Fn): Promise<FnRow[]> {
  return sql<FnRow[]>`
    select g.id, g.number, g.starts_on::text as starts_on, g.ends_on::text as ends_on, g.state,
           (select count(*)::int from change_log c where c.table_name = 'session' and c.op = 'move' and split_part(c.row_id, ' ', 2) = g.id::text) as moves
    from fortnight g where g.kind = 'teaching' and g.academic_year_id = (select academic_year_id from fortnight where id = ${f.id}) order by g.starts_on`;
}

export type Move = { id: string; fortnight_id: string; class_id: string; from: string; to: string; who: string; why: string | null; at: string; undo: boolean };

/** Every move of a fortnight, newest first: what moved, from where to where, who, why, when. An undo is a move back (a new row). */
export async function movesOf(fortnightId: string): Promise<Move[]> {
  const rows = await sql<{ id: string; row_id: string; before: Record<string, string>; after: Record<string, string>; staff_id: string | null; reason: string | null; at: string }[]>`
    select id, row_id, before, after, staff_id, reason, at::text as at from change_log
    where table_name = 'session' and op = 'move' and split_part(row_id, ' ', 2) = ${fortnightId} order by at desc, id`;
  const names = await staffNames();
  return rows.map((r) => ({
    id: r.id,
    fortnight_id: fortnightId,
    class_id: r.before.school_class_id ?? "",
    from: `${r.before.on_date} ${r.before.period_id}`,
    to: `${r.after.on_date} ${r.after.period_id}`,
    who: (r.staff_id && names.get(r.staff_id)) || "staff",
    why: r.reason,
    at: r.at,
    undo: /^undo/i.test(r.reason ?? ""),
  }));
}

export const staffNames = cache(async () => {
  const rows = await sql<{ id: string; name: string }[]>`select id, name from public.staff_list(${process.env.TENANT_SLUG ?? "cornerstone-pune"})`;
  return new Map(rows.map((r) => [r.id, r.name]));
});

export type Clash = { key: string; kind: string; detail: string; accepted: boolean; places: { class: string; date: string; period: string }[] };
export async function clashesOf(fortnightId: string): Promise<Clash[]> {
  return sql<Clash[]>`select clash_key as key, kind, detail, accepted, places from timetable_clash where fortnight_id = ${fortnightId} order by kind, detail`;
}

/** The engine's own words for a refusal, or ours when it said none. */
export async function refusal(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
  return typeof body.detail === "string" ? body.detail : fallback;
}
export { EngineDown, engineSend };

export type Took = { step: string; who: string; at: string };
/** Who took each step of a fortnight and when (the approval rows of kind `fortnight`), oldest first. */
export async function stepsTaken(fortnightId: string): Promise<Took[]> {
  const rows = await sql<{ decision: string; by: string; at: string }[]>`
    select decision, "by", created_at::text as at from approval where kind = 'fortnight' and target = ${fortnightId} order by seq`;
  const names = await staffNames();
  return rows.map((r) => ({ step: r.decision, who: names.get(r.by) ?? "staff", at: r.at }));
}

export type PlanLine = { id: string; text: string; week: string | null; class_label: string; activity: { code: string; name: string } | null };
export async function planOf(fortnightId: string): Promise<PlanLine[]> {
  return sql<PlanLine[]>`
    select p.id, p.text, p.week_code as week, c.label as class_label,
           case when a.id is null then null else jsonb_build_object('code', a.code, 'name', a.name) end as activity
    from plan_entry p join school_class c on c.id = p.school_class_id left join activity a on a.id = p.activity_id
    where p.fortnight_id = ${fortnightId} order by c.label, p.week_code nulls last, p.ord`;
}

/** Every class of the fortnight's academic year, each with how many lessons it has in that fortnight (a whole count), for the
 *  coordinator's class picker: she sees every class whatever state the fortnight is in (issue #691). Read-only. */
export type ClassRow = { id: string; grade: string; section: string; lessons: number };
export async function classesOf(f: Fn): Promise<ClassRow[]> {
  return sql<ClassRow[]>`
    select c.id::text as id, c.grade_code as grade, c.section,
           (select count(*)::int from session s join school_day d on d.id = s.school_day_id
             where s.school_class_id = c.id and d.on_date between ${f.starts_on}::date and ${f.ends_on}::date) as lessons
    from school_class c where c.academic_year_id = (select academic_year_id from fortnight where id = ${f.id}) order by c.grade_code, c.section`;
}

/** Whether educators see a timetable at all: config `educator.timetable_enabled`, the engine's one switch. Read only. */
export async function switchedOn(): Promise<boolean> {
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  return r?.on === true;
}

/** The fortnight that is live: once the switch is on, educators open on today's fortnight, or the next one when none runs today
 *  (a holiday), so that one is live when it has lessons; a fortnight a draft was put live for (`timetable_live`) is live too.
 *  The rest are planning. With the switch off nothing is live. Ids, so a page can ask of any row. */
export function liveIds(rows: readonly PlanRow[], today: string, on: boolean): Set<string> {
  if (!on) return new Set();
  const first = rows.find((r) => r.ends_on >= today && r.lessons > 0);
  return new Set([...rows.filter((r) => r.live).map((r) => r.id), ...(first ? [first.id] : [])]);
}

/** The words the coordinator reads about a fortnight: its state in the school's words, and what educators see of it. With the
 *  switch on the engine shows educators every fortnight with lessons, so a planning one says so rather than claim it is hidden. */
export function liveWords(state: string, w: { on: boolean; live: boolean; lessons: number }): string {
  const s = stateWords(state);
  if (!w.on) return `${s}: not live yet`;
  if (w.live) return `${s}: live, educators see it`;
  return w.lessons ? `${s}: planning, educators can already open it` : `${s}: planning, nothing placed yet`;
}

/** Every teaching fortnight of `f`'s year for one class, oldest first: its state, its lessons placed for the class (a whole count)
 *  and whether it went live for the class (`timetable_live`, CP-22). The coordinator's Live and Planning sections (#691). Read only. */
export type PlanRow = { id: string; number: number; starts_on: string; ends_on: string; state: string; lessons: number; live: boolean };
export async function yearFor(f: Fn, classId: string): Promise<PlanRow[]> {
  return sql<PlanRow[]>`
    select g.id, g.number, g.starts_on::text as starts_on, g.ends_on::text as ends_on, g.state,
           (select count(*)::int from session s join school_day d on d.id = s.school_day_id
             where s.school_class_id = ${classId} and d.on_date between g.starts_on and g.ends_on) as lessons,
           exists (select 1 from approval a where a.kind = 'timetable_live' and a.target = ${classId} || ' ' || g.id::text) as live
    from fortnight g where g.kind = 'teaching' and g.academic_year_id = (select academic_year_id from fortnight where id = ${f.id}) order by g.starts_on`;
}
