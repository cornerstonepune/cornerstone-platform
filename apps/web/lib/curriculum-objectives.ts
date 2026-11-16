import { sql } from "./db";
import { originsOf, type Origin } from "./origin";

// The objectives table and the check list (CP-64, issue #800): every learning objective with its place (grade, subject, topic), the
// capability it counts toward and that capability's words, how many activities build toward it, and where its links came from. Two
// reads for the whole page, never one per row: the page of rows (with the total beside them, one query) and the filters' options.
// Names no subject: the subject and topic rows are the school's (CP-54).

export type ObjRow = {
  code: string;
  band: string;
  title: string;
  subject: string;
  topic: string;
  capability: string;
  words: string[];
  activities: number;
  origins: Origin[];
};
export type ObjFilter = { grade?: string; subject?: string; topic?: string; origin?: Origin; q?: string; page: number };
export const PAGE = 10;
/** The origin words the rows store (sheet is `school`). */
const STORED: Record<Origin, string> = { sheet: "school", machine: "machine", person: "person" };

/** One page of objectives, in grade, subject, topic and code order, and how many match. */
export async function objectives(f: ObjFilter): Promise<{ rows: ObjRow[]; total: number }> {
  const like = f.q?.trim() ? `%${f.q.trim().replace(/[%_]/g, "")}%` : null;
  const rows = await sql<(Omit<ObjRow, "origins"> & { sources: string[]; total: number })[]>`
    with src as (
      select tenant_id, lo_code, source from activity_objective
      union all select tenant_id, lo_code, source from objective_statement
      union all select tenant_id, lo_code, source from learning_objective_skill),
    srcs as (select tenant_id, lo_code, array_agg(distinct source) as sources from src group by 1, 2),
    acts as (select tenant_id, lo_code, count(*)::int as n from activity_objective group by 1, 2),
    words as (
      select g.tenant_id, g.parent_code as cap, array_agg(distinct w order by w) as words
      from framework_statement g cross join lateral jsonb_array_elements_text(g.items) w
      where g.framework_code = 'CS-PROFILE' and g.kind = 'group' group by 1, 2)
    select lo.code, lo.band, lo.title, coalesce(su.label, su.name, '') as subject, coalesce(t.name, '') as topic,
      coalesce(cap.text, '') as capability, coalesce(w.words, '{}') as words, coalesce(a.n, 0) as activities,
      coalesce(s.sources, '{}') as sources, count(*) over ()::int as total
    from learning_objective lo
    left join grade g on g.tenant_id = lo.tenant_id and g.code = lo.band
    left join subject su on su.tenant_id = lo.tenant_id and su.code = lo.subject_code
    left join topic t on t.tenant_id = lo.tenant_id and t.code = lo.topic_code
    left join objective_statement os on os.tenant_id = lo.tenant_id and os.lo_code = lo.code and os.relation = 'counts_toward'
    left join framework_statement cap on cap.tenant_id = os.tenant_id and cap.framework_code = os.framework_code and cap.code = os.statement_code
    left join words w on w.tenant_id = cap.tenant_id and w.cap = cap.code
    left join acts a on a.tenant_id = lo.tenant_id and a.lo_code = lo.code
    left join srcs s on s.tenant_id = lo.tenant_id and s.lo_code = lo.code
    where not lo.retired
      and (${f.grade ?? null}::text is null or lo.band = ${f.grade ?? null})
      and (${f.subject ?? null}::text is null or lo.subject_code = ${f.subject ?? null})
      and (${f.topic ?? null}::text is null or lo.topic_code = ${f.topic ?? null})
      and (${f.origin ? STORED[f.origin] : null}::text is null or ${f.origin ? STORED[f.origin] : ""} = any(coalesce(s.sources, '{}')))
      and (${like}::text is null or lo.title ilike ${like})
    order by g.ord nulls last, su.label nulls last, t.ord nulls last, lo.code
    limit ${PAGE} offset ${(Math.max(1, f.page) - 1) * PAGE}`;
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((r) => ({ code: r.code, band: r.band, title: r.title, subject: r.subject, topic: r.topic, capability: r.capability, words: r.words, activities: r.activities, origins: originsOf(r.sources) })),
  };
}

export type Options = { grades: string[]; subjects: { code: string; name: string }[]; topics: { code: string; name: string; subject: string }[] };

/** What the filters offer: the grades, the subjects that have objectives, and the topics of them (all, with their subject: the page narrows them). */
export async function options(): Promise<Options> {
  const [grades, subjects, topics] = await Promise.all([
    sql<{ band: string }[]>`select lo.band from learning_objective lo left join grade g on g.tenant_id = lo.tenant_id and g.code = lo.band where not lo.retired group by lo.band, g.ord order by g.ord nulls last, lo.band`,
    sql<{ code: string; name: string }[]>`
      select s.code, coalesce(s.label, s.name) as name from subject s
      where exists (select 1 from learning_objective lo where lo.tenant_id = s.tenant_id and lo.subject_code = s.code and not lo.retired) order by 2`,
    sql<{ code: string; name: string; subject: string }[]>`
      select t.code, t.name, t.subject_code as subject from topic t
      where exists (select 1 from learning_objective lo where lo.tenant_id = t.tenant_id and lo.topic_code = t.code and not lo.retired) order by t.subject_code, t.ord`,
  ]);
  return { grades: grades.map((g) => g.band), subjects, topics };
}

export type Check = { grade: string; subject: string; subjectCode: string; links: number; skills: number; statements: number; total: number };

/** The machine-made rows by grade and subject: activity links, skill links, and framework statements, each counted from its own table. */
export async function toCheck(): Promise<Check[]> {
  return sql<Check[]>`
    with m as (
      select lo.band, lo.subject_code, 'link' as kind from activity_objective x join learning_objective lo on lo.tenant_id = x.tenant_id and lo.code = x.lo_code where x.source = 'machine' and not lo.retired
      union all select lo.band, lo.subject_code, 'skill' from learning_objective_skill x join learning_objective lo on lo.tenant_id = x.tenant_id and lo.code = x.lo_code where x.source = 'machine' and not lo.retired
      union all select lo.band, lo.subject_code, 'statement' from objective_statement x join learning_objective lo on lo.tenant_id = x.tenant_id and lo.code = x.lo_code where x.source = 'machine' and not lo.retired)
    select m.band as grade, coalesce(coalesce(su.label, su.name), 'No subject yet') as subject, coalesce(m.subject_code, '') as "subjectCode",
      count(*) filter (where kind = 'link')::int as links, count(*) filter (where kind = 'skill')::int as skills,
      count(*) filter (where kind = 'statement')::int as statements, count(*)::int as total
    from m left join subject su on su.code = m.subject_code left join grade g on g.code = m.band
    group by m.band, g.ord, su.label, su.name, m.subject_code order by g.ord nulls last, m.band, 2`;
}
