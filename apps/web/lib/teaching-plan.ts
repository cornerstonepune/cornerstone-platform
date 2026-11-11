// Where an activity sits in the timetable (UI-3c): the fortnights a class's plan puts it in, and the next time one of the person's
// classes teaches it. Read from the plan (`plan_entry`, `session`); nothing is decided here. A fortnight is taught once its last day has
// passed, coming up otherwise, by the school's own day (`schoolToday`). Only the classes the person sees.
import type { Me } from "./teaching";
import { sql } from "./db";
import { seesClass } from "./reach";
import { schoolToday } from "./school-clock";

export type InFortnight = { number: number; taught: boolean };
export type NextTaught = { id: string; day: string; starts_at: string; section: string };

/** The fortnights each activity is in, by activity code, in number order. */
export async function fortnightsOf(me: Me, codes: string[]): Promise<Map<string, InFortnight[]>> {
  const out = new Map<string, InFortnight[]>();
  if (!codes.length) return out;
  const today = await schoolToday();
  const rows = await sql<{ code: string; number: number; ends_on: string }[]>`
    select distinct a.code, f.number, f.ends_on::text as ends_on
    from plan_entry pe
    join activity a on a.id = pe.activity_id
    join fortnight f on f.id = pe.fortnight_id
    join school_class c on c.id = pe.school_class_id
    where a.code = any(${codes}::text[]) and ${seesClass(me, sql`c.label`)}
    order by a.code, f.number`;
  for (const r of rows) out.set(r.code, [...(out.get(r.code) ?? []), { number: r.number, taught: r.ends_on < today }]);
  return out;
}

/** The next lesson of the person's own classes that teaches this activity, today or later. */
export async function nextTaught(me: Me, code: string): Promise<NextTaught | null> {
  const today = await schoolToday();
  const [r] = await sql<NextTaught[]>`
    select s.id, d.on_date::text as day, to_char(p.starts_at, 'HH24:MI') as starts_at, c.label as section
    from session s
    join plan_entry pe on pe.id = s.plan_entry_id
    join activity a on a.id = pe.activity_id
    join school_day d on d.id = s.school_day_id
    join period p on p.id = s.period_id
    join school_class c on c.id = s.school_class_id
    where a.code = ${code} and d.on_date >= ${today}::date and ${seesClass(me, sql`c.label`)}
    order by d.on_date, p.starts_at limit 1`;
  return r ?? null;
}
