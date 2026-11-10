import { cache } from "react";
import { sql } from "./db";
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
export async function fortnightAt(day: string): Promise<Fn | null> {
  const [r] = await sql<Fn[]>`${FN()} and f.ends_on >= ${day}::date order by f.starts_on limit 1`;
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

/** The three subject colours the grid has; a subject with no colour of its own is drawn as arts. A presentation grouping
 *  only (it says nothing about the subject): numeracy is Number, language the languages, the rest the arts. */
const LANGUAGE = new Set(["ENG", "HIN", "MAR", "SAN"]);
export const subjectLook = (code: string | null): Exclude<Subject, "fixed"> => (code === "NUM" ? "numeracy" : code && LANGUAGE.has(code) ? "language" : "arts");

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
