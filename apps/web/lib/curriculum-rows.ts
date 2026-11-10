import { sql } from "./db";
import { PART_KEYS } from "./page-part";
import { screensGrade } from "./curriculum-screens";
import { levelsOf, skillSets, type Grades } from "./queries";
import type { Scope } from "./scope";

// Curriculum (UI-11): one list of what the school teaches. K2 is taught by activities, grades 1 to 4 by skills; each row is
// one of them, with how much of its page is filled in and whose words fill it. Read-only: the queries are the old
// browser's (lib/curriculum-screens.ts) and the skills list's (lib/queries.ts), laid side by side.

export type Fill = { school: number; drafted: number; person: number; empty: number };
export type CRow = {
  kind: "activity" | "skill";
  code: string;
  name: string;
  band: string;
  grade: string;
  subject: string;
  topic: string;
  levels: number;
  fill: Fill;
  /** activity: has a drafted part to check; skill: has a level still to approve. */
  status: "drafted" | "waiting" | "complete";
  href: string;
};

/** Every activity of the grade the activity screens list, with the whose-words count of its eight parts. */
async function activityRows(grades: Grades): Promise<CRow[]> {
  const band = await screensGrade();
  const part = PART_KEYS.map((k) => k as string);
  const rows = await sql<(Fill & { code: string; name: string; strand: string; levels: number })[]>`
    with t as (
      select a.tenant_id, a.code, p.part, btrim(p.txt) as txt
      from activity a cross join lateral (values ('objective', a.objective), ('materials', a.materials), ('steps', a.steps), ('thinking', a.thinking), ('level_0', a.level_0), ('level_1', a.level_1), ('level_2', a.level_2), ('level_3', a.level_3)) as p(part, txt)
      where a.band = ${band} and p.part = any(${part}))
    select a.code, a.name, a.strand,
      (select count(*) from unnest(array[a.level_0, a.level_1, a.level_2, a.level_3]) l where btrim(l) <> '')::int as levels,
      count(*) filter (where t.txt <> '' and coalesce(s.source, 'school') = 'school')::int as school,
      count(*) filter (where t.txt <> '' and s.source = 'drafted')::int as drafted,
      count(*) filter (where t.txt <> '' and s.source = 'person')::int as person,
      count(*) filter (where t.txt = '')::int as empty
    from activity a join t on t.tenant_id = a.tenant_id and t.code = a.code
    left join activity_part_source s on s.tenant_id = t.tenant_id and s.activity_code = t.code and s.part = t.part
    group by a.code, a.name, a.strand, a.level_0, a.level_1, a.level_2, a.level_3
    order by a.strand, a.code`;
  return rows.map((r) => ({
    kind: "activity",
    code: r.code,
    name: r.name,
    band,
    grade: grades.name(band),
    subject: "",
    topic: r.strand,
    levels: r.levels,
    fill: { school: r.school, drafted: r.drafted, person: r.person, empty: r.empty },
    status: r.drafted ? "drafted" : "complete",
    href: `/curriculum/fill/${r.code}`,
  }));
}

/** Every skill of the grades above it, with how many of its levels a person has approved. */
async function skillRows(grades: Grades, scope: Scope, kBand: string): Promise<CRow[]> {
  const sets = await skillSets({ untaught: true, scope });
  return sets
    .filter((s) => s.band !== kBand)
    .map((s) => {
      const levels = levelsOf(s);
      const approved = levels.filter((d) => s.approved[d]).length;
      return {
        kind: "skill" as const,
        code: s.code,
        name: s.name,
        band: s.band,
        grade: grades.name(s.band),
        subject: s.subject_name ?? "",
        topic: s.topic_name ?? "",
        levels: levels.length,
        fill: { school: approved, drafted: levels.length - approved, person: 0, empty: 0 },
        status: approved === levels.length ? ("complete" as const) : ("waiting" as const),
        href: `/skill-sets/${s.code}`,
      };
    });
}

export async function curriculumRows(grades: Grades, scope: Scope, withActivities = true): Promise<CRow[]> {
  const [acts, skills] = await Promise.all([withActivities ? activityRows(grades) : Promise.resolve([] as CRow[]), screensGrade().then((b) => skillRows(grades, scope, b))]);
  return [...acts, ...skills];
}
