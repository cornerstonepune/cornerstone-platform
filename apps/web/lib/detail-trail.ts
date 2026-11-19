// The path a curriculum detail page shows above its title (Nimish, 19 Nov 2026): Curriculum › grade › subject › unit › objective › the thing,
// every part a link, and what the activity page needs to go on to the next one waiting for a person. Server only; reads the tables the
// curriculum tree reads, nothing new.
import { sql } from "./db";
import { originOf, type Origin } from "./origin";
import { treeAt } from "@/app/(app)/setup/curriculum/tree-path";

export type Crumb = { label: string; href?: string };

/** Curriculum, the grade, the subject and the unit an objective sits in, each a link into the tree at that place; and the grade's and
 *  subject's words for the chips. */
export async function placeOf(lo: { band: string; subjectCode: string | null; unit: string }): Promise<{ crumbs: Crumb[]; grade: string; subject: string | null }> {
  const [row] = await sql<{ grade: string | null; subject: string | null }[]>`
    select (select name from grade where code = ${lo.band}) as grade,
           (select coalesce(label, name) from subject where code = ${lo.subjectCode}) as subject`;
  const subject = lo.subjectCode ?? undefined;
  const grade = row?.grade ?? lo.band;
  const said = subject ? (row?.subject ?? subject) : null;
  return {
    grade,
    subject: said,
    crumbs: [
      { label: "Curriculum", href: "/setup/curriculum" },
      { label: grade, href: treeAt({ grade: lo.band }) },
      ...(subject ? [{ label: said!, href: treeAt({ grade: lo.band, subject }) }] : []),
      ...(subject && lo.unit ? [{ label: lo.unit, href: treeAt({ grade: lo.band, subject, unit: lo.unit }) }] : []),
    ],
  };
}

/** The next activity of this grade that still waits for a person (its machine parts or links), after this one in code order and then
 *  round from the start; and how many wait besides this one. Null when nothing else waits. */
export async function nextToApprove(code: string, band: string): Promise<{ code: string; name: string; left: number } | null> {
  const [row] = await sql<{ code: string; name: string; left: number }[]>`
    with w as (
      select a.code, a.name from activity a
      where a.band = ${band} and a.code <> ${code} and (
        exists (select 1 from activity_part_source p where p.activity_code = a.code and p.source = 'drafted')
        or exists (select 1 from activity_skill k where k.activity_code = a.code and k.source = 'machine')
        or exists (select 1 from activity_objective o join learning_objective l on l.tenant_id = o.tenant_id and l.code = o.lo_code
                   where o.activity_code = a.code and (o.source = 'machine' or l.source = 'machine')))
    )
    select code, name, (select count(*)::int from w) as "left" from w order by code > ${code} desc, code limit 1`;
  return row ?? null;
}

export type Use = { code: string; name: string; origin: Origin | null };
/** Where a registry skill is used, grade by grade: its objectives and its activities, one row for a name that repeats in a grade. */
export async function skillUse(code: string): Promise<{ grade: string; name: string; objectives: Use[]; activities: Use[] }[]> {
  const [los, acts, names] = await Promise.all([
    sql<{ band: string; code: string; name: string; source: string | null }[]>`
      select l.band, min(l.code) as code, l.title as name, min(s.source) as source
      from learning_objective_skill s join learning_objective l on l.tenant_id = s.tenant_id and l.code = s.lo_code
      where s.skill_code = ${code} and not l.retired group by l.band, l.title`,
    sql<{ band: string; code: string; name: string; source: string | null }[]>`
      select a.band, min(a.code) as code, a.name, min(k.source) as source
      from activity_skill k join activity a on a.tenant_id = k.tenant_id and a.code = k.activity_code
      where k.skill_code = ${code} group by a.band, a.name`,
    sql<{ code: string; name: string }[]>`select code, name from grade order by ord`,
  ]);
  const byName = (x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name);
  los.sort(byName);
  acts.sort(byName);
  const bands = [...new Set([...los, ...acts].map((r) => r.band))].sort((a, b) => names.findIndex((n) => n.code === a) - names.findIndex((n) => n.code === b));
  return bands.map((b) => ({
    grade: b,
    name: names.find((n) => n.code === b)?.name ?? b,
    objectives: los.filter((r) => r.band === b).map((r) => ({ code: r.code, name: r.name, origin: originOf(r.source) })),
    activities: acts.filter((r) => r.band === b).map((r) => ({ code: r.code, name: r.name, origin: originOf(r.source) })),
  }));
}
