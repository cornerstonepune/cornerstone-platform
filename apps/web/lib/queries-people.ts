import { sql } from "./db";
import { EVERY_CLASS, type Scope } from "./scope";
import { classesOf } from "./taught";

// What waits on a person, and who it is for (goals/ny1-needs-you.yaml): who decides each kind of thing (`people.decides`,
// by the staff list's roles), which topics are taught and who said so, and the questions the engine drafted for a
// person to answer (`ask`).

export const ROLE_WORDS: Record<string, string> = { coordinator: "a coordinator", educator: "an educator", specialist: "a specialist" };

/** A class's word on one skill (goals/t1-topics-are-operations.yaml): its own (`own`), or the school's while no one has
 *  spoken for the class — with who said it, if a person did, and when. `reaches`: one of its levels is the class's
 *  grade or below, so the class's children can be given it (a child never meets a grade above their own). */
export type SkillTaught = {
  code: string;
  name: string;
  taught: boolean;
  own: boolean;
  by: string | null;
  at: string | null;
  reaches: boolean;
};

/** A class's word on a topic: taught when any of its skills is (`taught_in`), each skill's own word beside it. `own`, `by`
 *  and `at` are the latest word said of one of its skills for the class, else the school's. */
export type ClassTaught = { section: string; taught: boolean; by: string | null; at: string | null; own: boolean; skills: SkillTaught[] };

/** `taught`: in any of the classes shown. `shown`: one of its skills is taught in one of them and reaches that class's
 *  grade, so a page about those classes can show it (goals/t1-topics-are-operations.yaml). */
export type Topic = { code: string; name: string; subject: string; taught: boolean; shown: boolean; classes: ClassTaught[]; skills: { code: string; name: string }[] };

/** Every topic in the tree's order, with its skills' names and each class's word on each of its skills: the classes
 *  of the scope. */
export async function topics(scope: Scope = EVERY_CLASS): Promise<Topic[]> {
  const classes = await classesOf(scope);
  const rows = await sql<{ code: string; name: string; subject: string; skills: { code: string; name: string }[]; classes: { section: string; skills: SkillTaught[] }[] }[]>`
    -- each class's grade once (class_band), not once per level: left inline, the planner asked it again for every level
    -- of every skill of every topic of every class (CI, 10 Nov 2026: 1.4 s a page)
    with k as materialized (
      select tn.tenant_id, c.section, class_band(tn.tenant_id, c.section) as band
      from (select distinct tenant_id from topic) tn, unnest(${classes}::text[]) as c(section))
    select t.code, t.name, t.subject_code as subject,
           coalesce((select json_agg(json_build_object('code', s.code, 'name', s.name) order by s.code) from skill s
                     where s.tenant_id = t.tenant_id and s.topic_code = t.code), '[]'::json) as skills,
           (select coalesce(json_agg(json_build_object('section', k.section, 'skills', (
                      select coalesce(json_agg(json_build_object(
                               'code', s.code, 'name', s.name, 'taught', skill_taught_in(s.tenant_id, s.code, k.section),
                               'own', cw.word is not null, 'by', coalesce(cw.word ->> 'by', s.taught_by),
                               'at', coalesce(cw.word ->> 'at', s.taught_at::text),
                               'reaches', exists (select 1 from skill_level l where l.tenant_id = s.tenant_id and l.skill_code = s.code
                                                  and grade_ord(l.tenant_id, l.grade) <= grade_ord(s.tenant_id, k.band))
                             ) order by s.code), '[]')
                      from skill s
                      left join lateral (  -- the class's own word on the skill (school_class.taught), this year's class
                        select sc.taught -> s.code as word from school_class sc join academic_year y on y.id = sc.academic_year_id
                        where sc.tenant_id = s.tenant_id and sc.label = k.section
                        order by y.starts_on desc limit 1) cw on true
                      where s.tenant_id = t.tenant_id and s.topic_code = t.code)) order by k.section), '[]')
            from k where k.tenant_id = t.tenant_id) as classes
    from topic t
    order by t.ord`;
  return rows.map((t) => {
    const each: ClassTaught[] = t.classes.map((c) => {
      const said = c.skills.filter((s) => s.own).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
      const school = c.skills.find((s) => s.by);
      return {
        section: c.section,
        taught: c.skills.some((s) => s.taught),
        own: Boolean(said),
        by: (said ?? school)?.by ?? null,
        at: (said ?? school)?.at ?? null,
        skills: c.skills,
      };
    });
    return {
      code: t.code,
      name: t.name,
      subject: t.subject,
      skills: t.skills,
      classes: each,
      taught: each.some((c) => c.taught),
      shown: each.some((c) => c.skills.some((s) => s.taught && s.reaches)),
    };
  });
}

/** This year's row of each class, one a class, carrying its words on skills (`school_class.taught`): the left side of
 *  `skill_taught_in`, to join to. `skill_taught_in` and `taught_in` cannot be inlined (they pin their search path), so a query
 *  that asked them once per topic per class per skill cost every page about a second once thirty classes were on the copy
 *  (CI, 10 Nov 2026, u71). Read as a join, with `skillIsTaught`, the same answer is one pass. */
export const classWords = () => sql`
  select distinct on (sc.tenant_id, sc.label) sc.tenant_id, sc.label as section, sc.taught
  from school_class sc join academic_year y on y.id = sc.academic_year_id
  order by sc.tenant_id, sc.label, y.starts_on desc`;

/** Whether the skill `s` is taught in the class row `cls` (from `classWords`, left-joined): the class's own word, else the
 *  school's (`skill.taught`), else not taught: `skill_taught_in`'s rule, as an expression. */
export const skillIsTaught = () => sql`coalesce((cls.taught -> s.code ->> 'taught')::boolean, s.taught, false)`;

/** The topics that some class of the scope has not been taught, each with those classes: all the menu's count needs of
 *  `topics` (`tasksFor`, on every page). A topic with no skill is taught in no class. */
export async function untaughtTopics(scope: Scope = EVERY_CLASS): Promise<{ code: string; name: string; subject: string; sections: string[] }[]> {
  const classes = await classesOf(scope);
  return sql<{ code: string; name: string; subject: string; sections: string[] }[]>`
    with cls as (${classWords()}),
    k as (
      select tn.tenant_id, c.section
      from (select distinct tenant_id from topic) tn, unnest(${classes}::text[]) as c(section))
    select t.code, t.name, t.subject_code as subject, array_agg(k.section order by k.section) as sections
    from topic t
    join k on k.tenant_id = t.tenant_id
    left join cls on cls.tenant_id = k.tenant_id and cls.section = k.section
    where not exists (
      select 1 from skill s
      where s.tenant_id = t.tenant_id and s.topic_code = t.code and ${skillIsTaught()})
    group by t.code, t.name, t.subject_code, t.ord
    order by t.ord`;
}

export type Ask = {
  code: string;
  for_role: string;
  question: string;
  drafted: string;
  why: string | null;
  source: string;
  link: string | null;
  answer: "agreed" | "corrected" | null;
  correction: string | null;
  answered_by: string | null;
  answered_at: string | null;
};

/** Every question drafted for a person, in the order drafted. */
export async function asks(): Promise<Ask[]> {
  return sql<Ask[]>`
    select code, for_role, question, drafted, why, source, link, answer, correction, answered_by,
           answered_at::text as answered_at
    from ask order by ord, code`;
}

/** {role: questions still waiting}, for Today. */
export async function asksWaiting(): Promise<{ for_role: string; n: number }[]> {
  return sql<{ for_role: string; n: number }[]>`
    select for_role, count(*)::int as n from ask where answer is null group by for_role order by for_role`;
}

/** Skills waiting for an approval, taught or not: one is approved before its topic is switched on. Today, Curriculum
 *  and the approval page all count these. */
export async function skillsWaiting(): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from skill where status <> 'ratified'`;
  return n;
}
