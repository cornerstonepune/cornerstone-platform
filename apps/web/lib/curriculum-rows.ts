import { sql } from "./db";
import { PART_KEYS } from "./page-part";
import { screensGrade } from "./curriculum-screens";
import { originsOf, type Origin } from "./origin";
import { levelsOf, skillSets, type Grades } from "./queries";
import { skillSetHref } from "./skill-set-href";
import type { Scope } from "./scope";

// Curriculum (UI-11, page charter Part C): one list of what the school teaches. K2 is taught by activities, grades 1 to 4 by skills; each
// row is one of them, with how much of its page is filled in and where its words and links came from (CP-48: sheet, machine or person).
// Read-only: the queries are the old browser's (lib/curriculum-screens.ts) and the skills list's (lib/queries.ts), laid side by side.

/** An activity's eight parts by where their words came from, as stored (`activity_part_source`: school | drafted | person), and the empty ones. */
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
  /** Where its parts and its links (objectives, skills, the objectives themselves) came from; a skill set is the sheet's. */
  origins: Origin[];
  /** activity: a part nobody has written; skill: a level still to approve. */
  status: "empty" | "waiting" | "complete";
  /** The panel's `open=` for it: `activity:<code>` or `skillset:<code>`. */
  open: string;
  /** Its own full page. */
  href: string;
};

/** Every activity of the grade the activity screens list, with the whose-words count of its eight parts and where its links came from. */
async function activityRows(grades: Grades): Promise<CRow[]> {
  const band = await screensGrade();
  const part = PART_KEYS.map((k) => k as string);
  const rows = await sql<(Fill & { code: string; name: string; strand: string; levels: number; links: string[] })[]>`
    with t as (
      select a.tenant_id, a.code, p.part, btrim(p.txt) as txt
      from activity a cross join lateral (values ('objective', a.objective), ('materials', a.materials), ('steps', a.steps), ('thinking', a.thinking), ('level_0', a.level_0), ('level_1', a.level_1), ('level_2', a.level_2), ('level_3', a.level_3)) as p(part, txt)
      where a.band = ${band} and p.part = any(${part}))
    select a.code, a.name, a.strand,
      (select count(*) from unnest(array[a.level_0, a.level_1, a.level_2, a.level_3]) l where btrim(l) <> '')::int as levels,
      count(*) filter (where t.txt <> '' and coalesce(s.source, 'school') = 'school')::int as school,
      count(*) filter (where t.txt <> '' and s.source = 'drafted')::int as drafted,
      count(*) filter (where t.txt <> '' and s.source = 'person')::int as person,
      count(*) filter (where t.txt = '')::int as empty,
      array(select x.source from activity_objective x where x.tenant_id = a.tenant_id and x.activity_code = a.code
            union select l.source from activity_objective x join learning_objective l on l.tenant_id = x.tenant_id and l.code = x.lo_code where x.tenant_id = a.tenant_id and x.activity_code = a.code
            union select k.source from activity_skill k where k.tenant_id = a.tenant_id and k.activity_code = a.code) as links
    from activity a join t on t.tenant_id = a.tenant_id and t.code = a.code
    left join activity_part_source s on s.tenant_id = t.tenant_id and s.activity_code = t.code and s.part = t.part
    group by a.tenant_id, a.code, a.name, a.strand, a.level_0, a.level_1, a.level_2, a.level_3
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
    origins: originsOf([r.school ? "school" : null, r.drafted ? "drafted" : null, r.person ? "person" : null, ...r.links]),
    status: r.empty ? "empty" : "complete",
    open: `activity:${r.code}`,
    href: `/setup/activities/${r.code}`,
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
        fill: { school: approved, drafted: 0, person: 0, empty: levels.length - approved },
        origins: ["sheet" as const],
        status: approved === levels.length ? ("complete" as const) : ("waiting" as const),
        open: `skillset:${s.code}`,
        href: skillSetHref(s.code),
      };
    });
}

export async function curriculumRows(grades: Grades, scope: Scope, withActivities = true): Promise<CRow[]> {
  const [acts, skills] = await Promise.all([withActivities ? activityRows(grades) : Promise.resolve([] as CRow[]), screensGrade().then((b) => skillRows(grades, scope, b))]);
  return [...acts, ...skills];
}
