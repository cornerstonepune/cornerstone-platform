import { sql } from "./db";

// Curriculum as one tree (CP-67, issue #827): grade → subject → unit → objective. The unit is the objective's own `unit`, filled for nearly
// every objective; `topic_code` is empty on the live database, which is why the flow that waited for a topic showed nothing (Grade 2 →
// Maths). One read per grade gives every subject and unit with its counts, and one more every objective under them; an objective with no subject or no unit sits under a row of
// its own, so the counts of a grade's rows add up to its active objectives and nothing is hidden. Names no subject: the rows are the school's.

export const NONE = "-";
export type Unit = { key: string; name: string; objectives: number; activities: number };
export type Branch = { key: string; name: string; objectives: number; activities: number; units: Unit[] };

/** Every subject of a grade, in the school's subject order, each with its units; counts are active objectives and distinct activities. */
export async function branches(grade: string): Promise<Branch[]> {
  const rows = await sql<{ subject: string | null; name: string | null; unit: string | null; objectives: number; activities: number; acts: string[] }[]>`
    select lo.subject_code as subject, coalesce(su.label, su.name) as name, nullif(btrim(lo.unit), '') as unit,
      count(distinct lo.code)::int as objectives, count(distinct x.activity_code)::int as activities,
      coalesce(array_agg(distinct x.activity_code) filter (where x.activity_code is not null), '{}') as acts
    from learning_objective lo
    left join subject su on su.tenant_id = lo.tenant_id and su.code = lo.subject_code
    left join activity_objective x on x.tenant_id = lo.tenant_id and x.lo_code = lo.code
    where not lo.retired and lo.band = ${grade}
    group by 1, 2, 3 order by 2 nulls last, 3 nulls last`;
  const out = new Map<string, Branch & { seen: Set<string> }>();
  for (const r of rows) {
    const key = r.subject ?? NONE;
    const b = out.get(key) ?? { key, name: r.name ?? "No subject yet", objectives: 0, activities: 0, units: [], seen: new Set<string>() };
    b.objectives += r.objectives;
    for (const a of r.acts) b.seen.add(a);
    b.activities = b.seen.size;
    b.units.push({ key: r.unit ?? NONE, name: r.unit ?? "No unit yet", objectives: r.objectives, activities: r.activities });
    out.set(key, b);
  }
  return [...out.values()].map((b) => ({ key: b.key, name: b.name, objectives: b.objectives, activities: b.activities, units: b.units }));
}

export type Leaf = { code: string; title: string; activities: number; subject: string; unit: string };

/** Every objective of a grade, in code order, each with how many activities build toward it and the subject and unit it sits under
 *  (`NONE` for none). One read per grade: the tree opens a unit from this, never by asking again. */
export async function leavesOfGrade(grade: string): Promise<Leaf[]> {
  return sql<Leaf[]>`
    select lo.code, lo.title, count(x.activity_code)::int as activities,
      coalesce(lo.subject_code, ${NONE}) as subject, coalesce(nullif(btrim(lo.unit), ''), ${NONE}) as unit
    from learning_objective lo
    left join activity_objective x on x.tenant_id = lo.tenant_id and x.lo_code = lo.code
    where not lo.retired and lo.band = ${grade}
    group by lo.code, lo.title, lo.subject_code, lo.unit order by lo.code`;
}
