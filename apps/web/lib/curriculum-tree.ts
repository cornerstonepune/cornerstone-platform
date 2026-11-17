import { sql } from "./db";

// Curriculum as one tree (CP-67, issue #827): grade → subject → unit → objective. The unit is the objective's own `unit`, filled for nearly
// every objective; `topic_code` is empty on the live database, which is why the flow that waited for a topic showed nothing (Grade 2 →
// Maths). One read per grade gives every subject and unit with its counts; an objective with no subject or no unit sits under a row of
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
  return [...out.values()].map(({ seen: _, ...b }) => b);
}

export type Leaf = { code: string; title: string; activities: number };

/** The objectives of one unit of one subject in one grade, in code order, each with how many activities build toward it. */
export async function leaves(grade: string, subject: string, unit: string): Promise<Leaf[]> {
  const s = subject === NONE ? null : subject;
  const u = unit === NONE ? null : unit;
  return sql<Leaf[]>`
    select lo.code, lo.title, count(x.activity_code)::int as activities
    from learning_objective lo
    left join activity_objective x on x.tenant_id = lo.tenant_id and x.lo_code = lo.code
    where not lo.retired and lo.band = ${grade}
      and lo.subject_code is not distinct from ${s}
      and nullif(btrim(lo.unit), '') is not distinct from ${u}
    group by lo.code, lo.title order by lo.code`;
}
