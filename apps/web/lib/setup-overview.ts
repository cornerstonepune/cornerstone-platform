import { sql } from "./db";
import { school, today } from "./queries-coordinator";
import { staffList } from "./queries";
import { bankTotals } from "./queries-bank";
import { screensGrade, waiting, readOffers } from "./curriculum-screens";

// What the Setup screen (docs/frontend/screens.json `setup`) reads beyond its counts: the curriculum's size, the bank's, the
// school's year, what waits for a person, and the last set-up changes. Each is one question to the database or the engine;
// the page only draws them.

export type SetupOverview = {
  curriculum: { activities: number; grade: string; skills: number; draftedToCheck: number };
  bank: { ready: number; removed: number };
  school: { campus: string; year: string; span: string; teaching: number; holiday: number };
  waiting: { drafted: number; offers: number; removed: number };
};

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const when = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`)).replace(" ", "-");

export async function setupOverview(email: string): Promise<SetupOverview> {
  const band = await screensGrade();
  const [counts] = await sql<{ activities: number; skills: number }[]>`
    select (select count(*)::int from activity where tenant_id = ${school()} and band = ${band}) as activities,
           (select count(*)::int from skill where tenant_id = ${school()}) as skills`;
  const [drafts, offers, totals] = await Promise.all([waiting(), readOffers(email).catch(() => []), bankTotals()]);
  const [y] = await sql<{ campus: string; label: string; starts: string; ends: string; teaching: number; holiday: number }[]>`
    select (select name from campus where tenant_id = ${school()} order by created_at limit 1) as campus, y.label,
           to_char(y.starts_on, 'FMDD-Mon') as starts, to_char(y.ends_on, 'FMDD-Mon') as ends,
           (select count(*)::int from fortnight f where f.academic_year_id = y.id and f.kind = 'teaching') as teaching,
           (select count(*)::int from fortnight f where f.academic_year_id = y.id and f.kind in ('vacation', 'celebration')) as holiday
    from academic_year y where y.tenant_id = ${school()} and ${today()} between y.starts_on and y.ends_on limit 1`;
  const checked = new Set(drafts.map((d) => d.code)).size;
  return {
    curriculum: { activities: counts.activities, grade: band, skills: counts.skills, draftedToCheck: drafts.length || checked },
    bank: { ready: totals.bank, removed: totals.retired },
    school: { campus: y?.campus ?? "", year: y?.label ?? "", span: y ? `${y.starts} to ${y.ends}` : "", teaching: y?.teaching ?? 0, holiday: y?.holiday ?? 0 },
    waiting: { drafted: drafts.length, offers: offers.length, removed: totals.retired },
  };
}

export type Change = { kind: "skill" | "child" | "assessment" | "period"; title: string; by: string; at: string };

/** The last set-up changes, newest first, from the one history log (`change_log`): who made each and when. */
export async function changedLately(limit = 4): Promise<Change[]> {
  const rows = await sql<{ table_name: string; op: string; row_id: string; after: Record<string, string> | null; staff_id: string | null; origin: string | null; day: string }[]>`
    select table_name, op, row_id, after, staff_id::text, origin, to_char(at at time zone (select value #>> '{}' from config where key = 'school.time_zone'), 'YYYY-MM-DD') as day
    from change_log
    where tenant_id = ${school()} and table_name in ('skill_level', 'child', 'item', 'staff_role_grant')
    order by at desc, id limit ${limit}`;
  const names = new Map((await staffList()).map((p) => [p.id, p.name]));
  return rows.map((r) => {
    const by = (r.staff_id && names.get(r.staff_id)) || r.origin || "";
    const at = when(r.day);
    if (r.table_name === "child") return { kind: "child", title: `A child moved class: ${r.row_id}`, by, at };
    if (r.table_name === "item") return { kind: "assessment", title: "A question's wording corrected", by, at };
    if (r.table_name === "staff_role_grant") return { kind: "period", title: `A grant ${r.op === "delete" ? "ended" : "added"}`, by, at };
    return { kind: "skill", title: `Skill levels ${r.op === "approve" ? "approved" : "changed"}: ${r.row_id}`, by, at };
  });
}
