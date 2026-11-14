import { sql } from "./db";
import { screensGrade } from "./curriculum-screens";
import { linkRule } from "./period";

// CP-51: the lessons whose activity a person still has to settle, for the coordinator on Curriculum (view `lessons`). A teaching lesson
// (not a fixed one) of the activity screens' grade is listed when its activity is only the machine's match of its planner line ("To
// approve": choosing it on the lesson keeps it as a person's), or when it has none: its planner line matched no activity on the school's
// list, or it has no planner line at all. Each opens the lesson, where "Choose an activity" offers the activities of its kind. Until a
// person chooses, its marks are kept but reach no skill (the engine's safety rule). Read only; no name.
export type LessonWhy = "machine" | "no_match" | "no_line";
export const WHY_WORDS: Record<LessonWhy, string> = {
  machine: "Matched by the machine: to approve",
  no_match: "Its planner line names no activity on the list",
  no_line: "No planner line",
};
export type LessonToConfirm = { id: string; day: string; section: string; subject: string; text: string; activity: string | null; why: LessonWhy };

export async function lessonsToConfirm(): Promise<LessonToConfirm[]> {
  const band = await screensGrade();
  return sql<LessonToConfirm[]>`
    select s.id::text, d.on_date::text as day, sc.label as section, coalesce(su.label, su.name, s.subject_code, '') as subject,
           coalesce(nullif(btrim(pe.text), ''), s.text) as text, a.name as activity,
           case when ${linkRule()} = 'model' then 'machine' when s.plan_entry_id is null then 'no_line' else 'no_match' end as why
    from session s
    join school_class sc on sc.id = s.school_class_id and sc.grade_code = ${band}
    join school_day d on d.id = s.school_day_id
    left join subject su on su.tenant_id = s.tenant_id and su.code = s.subject_code
    left join plan_entry pe on pe.id = s.plan_entry_id
    left join activity a on a.id = pe.activity_id
    where s.kind <> 'fixed' and s.activity_code is null and (pe.activity_id is null or pe.link_rule = 'model')
    order by case when ${linkRule()} = 'model' then 0 when s.plan_entry_id is null then 2 else 1 end, d.on_date, sc.label`;
}
