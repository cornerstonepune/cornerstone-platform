import { sql } from "./db";
import { school, today } from "./queries-coordinator";
import { staffList } from "./queries";
import { bankTotals } from "./queries-bank";
import { gap, screensGrade, readOffers } from "./curriculum-screens";
import { levels } from "./levels";

// What the Setup screen (docs/frontend/screens.json `setup`) reads beyond its counts: the curriculum's size, the bank's, the
// school's year, what waits for a person, and the last set-up changes. Each is one question to the database or the engine;
// the page only draws them.

export type SetupOverview = {
  /** `machine`: the parts of its activities the machine made (CP-48), shown with its symbol; nothing waits on them. */
  curriculum: { activities: number; grade: string; skills: number; machine: number };
  bank: { ready: number; removed: number };
  school: { campus: string; year: string; span: string; teaching: number; holiday: number };
  waiting: { offers: number; removed: number };
};

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const when = (iso: string) => DAY.format(new Date(`${iso}T00:00:00Z`)).replace(" ", "-");

export async function setupOverview(email: string): Promise<SetupOverview> {
  const band = await screensGrade();
  const [counts] = await sql<{ activities: number; skills: number }[]>`
    select (select count(*)::int from activity where tenant_id = ${school()} and band = ${band}) as activities,
           (select count(*)::int from skill where tenant_id = ${school()}) as skills`;
  const [parts, offers, totals] = await Promise.all([gap(), readOffers(email).catch(() => []), bankTotals()]);
  const [y] = await sql<{ campus: string; label: string; starts: string; ends: string; teaching: number; holiday: number }[]>`
    select (select name from campus where tenant_id = ${school()} order by created_at limit 1) as campus, y.label,
           to_char(y.starts_on, 'FMDD-Mon') as starts, to_char(y.ends_on, 'FMDD-Mon') as ends,
           (select count(*)::int from fortnight f where f.academic_year_id = y.id and f.kind = 'teaching') as teaching,
           (select count(*)::int from fortnight f where f.academic_year_id = y.id and f.kind in ('vacation', 'celebration')) as holiday
    from academic_year y where y.tenant_id = ${school()} and ${today()} between y.starts_on and y.ends_on limit 1`;
  return {
    curriculum: { activities: counts.activities, grade: band, skills: counts.skills, machine: parts.reduce((t, p) => t + p.drafted, 0) },
    bank: { ready: totals.bank, removed: totals.retired },
    school: { campus: y?.campus ?? "", year: y?.label ?? "", span: y ? `${y.starts} to ${y.ends}` : "", teaching: y?.teaching ?? 0, holiday: y?.holiday ?? 0 },
    waiting: { offers: offers.length, removed: totals.retired },
  };
}

export type Change = { kind: "skill" | "child" | "assessment"; title: string; by: string; at: string; when: number };

/** The last set-up changes, newest first: a skill's level approved or sent back and a question removed or corrected (the
 *  `approval` log), and a child moved to another class (`change_log`). Who made each and when. `only` narrows it to one kind. */
export async function changedLately(limit = 4, only?: Change["kind"]): Promise<Change[]> {
  const zone = sql`(select value #>> '{}' from config where key = 'school.time_zone')`;
  const [approvals, moves] = await Promise.all([
    only === "child"
      ? []
      : sql<{ kind: string; decision: string; target: string; by: string; reason: string | null; name: string | null; day: string; at: Date }[]>`
          select a.kind, a.decision, a.target, a."by", a.reason, sk.name, to_char(a.created_at at time zone ${zone}, 'YYYY-MM-DD') as day, a.created_at as at
          from approval a left join skill sk on sk.tenant_id = a.tenant_id and a.kind = 'skill_level' and sk.code = split_part(a.target, ' ', 1)
          where a.tenant_id = ${school()} and a.kind in ('skill_level', 'item') ${only === "skill" ? sql`and a.kind = 'skill_level'` : only === "assessment" ? sql`and a.kind = 'item'` : sql``}
          order by a.created_at desc limit ${limit}`,
    only && only !== "child"
      ? []
      : sql<{ row_id: string; after: Record<string, string> | null; staff_id: string | null; origin: string | null; day: string; at: Date }[]>`
          select row_id, after, staff_id::text, origin, to_char(at at time zone ${zone}, 'YYYY-MM-DD') as day, at
          from change_log where tenant_id = ${school()} and table_name = 'child' and op = 'move' order by at desc limit ${limit}`,
  ]);
  const [staff, { order }] = await Promise.all([staffList(), levels()]);
  const names = new Map(staff.map((p) => [p.id, p.name]));
  const made: Change[] = [
    ...approvals.map((r): Change => {
      if (r.kind === "item") return { kind: "assessment", title: r.reason?.startsWith("Corrected") ? "A question's wording corrected" : "A question removed", by: r.by, at: when(r.day), when: +r.at };
      const level = order.find((d) => r.target.endsWith(` ${d}`));
      const what = `${r.name ?? r.target.split(" ")[0]}${level ? ` · ${level}` : ""}`;
      return { kind: "skill", title: `${r.decision === "approved" ? "Skill level approved" : "A level sent back"}: ${what}`, by: r.by, at: when(r.day), when: +r.at };
    }),
    ...moves.map((r): Change => ({ kind: "child", title: `A child moved class: Sr. No. ${r.row_id}${r.after?.section ? ` to ${r.after.section}` : ""}`, by: (r.staff_id && names.get(r.staff_id)) || r.origin || "", at: when(r.day), when: +r.at })),
  ];
  return made.sort((a, b) => b.when - a.when).slice(0, limit);
}
