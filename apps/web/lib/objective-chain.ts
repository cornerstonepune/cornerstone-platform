import { sql } from "./db";
import { originOf, type Origin } from "./origin";

// One learning objective's whole chain, both ways (CP-64, Done when 3). Up: its grade, subject and topic, the capability it counts toward and that
// capability's words, and the framework statements it is held against. Down: the skills it builds, with how many confirmed pieces of evidence
// each holds (a count, never a child), and the activities that build toward it. Five reads, whatever the objective; nothing computed but counts.

export type Statement = { framework: string; frameworkName: string; code: string; printed: string | null; text: string | null; relation: string; origin: Origin | null };
export type Chain = {
  code: string;
  band: string;
  title: string;
  kind: string;
  subject: string | null;
  topic: string | null;
  capability: { name: string; words: string[]; origin: Origin | null } | null;
  statements: Statement[];
  skills: { code: string; name: string; origin: Origin | null; evidence: number }[];
  activities: { code: string; name: string; origin: Origin | null }[];
};

export async function chainOf(code: string): Promise<Chain | null> {
  const [lo] = await sql<{ code: string; band: string; title: string; kind: string; subject: string | null; topic: string | null; subject_code: string | null }[]>`
    select lo.code, lo.band, lo.title, lo.kind, coalesce(su.label, su.name) as subject, t.name as topic, lo.subject_code
    from learning_objective lo left join subject su on su.tenant_id = lo.tenant_id and su.code = lo.subject_code
    left join topic t on t.tenant_id = lo.tenant_id and t.code = lo.topic_code where lo.code = ${code}`;
  if (!lo) return null;
  const [statements, skills, activities] = await Promise.all([
    sql<(Omit<Statement, "origin"> & { source: string; words: string[] })[]>`
      select f.code as framework, f.name as "frameworkName", s.code, s.printed_code as printed, s.text, o.relation, o.source,
        coalesce((select array_agg(distinct w order by w) from framework_statement g cross join lateral jsonb_array_elements_text(g.items) w
                  where g.tenant_id = s.tenant_id and g.framework_code = s.framework_code and g.parent_code = s.code and g.kind = 'group'), '{}') as words
      from objective_statement o join framework_statement s on s.tenant_id = o.tenant_id and s.framework_code = o.framework_code and s.code = o.statement_code
      join framework f on f.tenant_id = s.tenant_id and f.code = s.framework_code
      where o.lo_code = ${code} order by o.relation, f.code, s.ord nulls last, s.code`,
    sql<{ code: string; name: string; source: string; evidence: number }[]>`
      select r.code, r.name, k.source,
        (select count(*)::int from evidence_event e where e.skill_code = r.code and e.confirmed_by is not null) as evidence
      from learning_objective_skill k join registry_skill r on r.tenant_id = k.tenant_id and r.code = k.skill_code
      where k.lo_code = ${code} order by r.name`,
    sql<{ code: string; name: string; source: string }[]>`
      select a.code, a.name, x.source from activity_objective x join activity a on a.tenant_id = x.tenant_id and a.code = x.activity_code
      where x.lo_code = ${code} order by x.ord, a.name`,
  ]);
  const cap = statements.find((s) => s.relation === "counts_toward");
  return {
    code: lo.code, band: lo.band, title: lo.title, kind: lo.kind, subject: lo.subject, topic: lo.topic,
    capability: cap ? { name: cap.text ?? cap.code, words: cap.words, origin: originOf(cap.source) } : null,
    statements: statements.filter((s) => s !== cap).map((s) => ({ framework: s.framework, frameworkName: s.frameworkName, code: s.code, printed: s.printed, text: s.text, relation: s.relation, origin: originOf(s.source) })),
    skills: skills.map(({ source, ...s }) => ({ ...s, origin: originOf(source) })),
    activities: activities.map(({ source, ...a }) => ({ ...a, origin: originOf(source) })),
  };
}
