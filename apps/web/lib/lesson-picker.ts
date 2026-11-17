import { sql } from "./db";
import { EngineDown, engineSend } from "./engine";
import { schoolToday } from "./school-clock";

// CP-74: what the picker reads (specs/CP-74/spec.md). Nothing is ranked or decided here: the tiers, who may choose and every refusal are the
// engine's (`/timetable/lesson/next`). This file only shapes the answer and finds which dated lesson a place in the Build grid stands for.
export type ORow = { code: string; title: string; unit: string; ord: number; activities: number; taught_on: string | null };
export type OUnit = { unit: string; done: number; of: number; rows: ORow[]; other?: boolean };
export type OTier = ({ tier: "rest_of_unit" | "next_unit" } & OUnit) | { tier: "all"; units: OUnit[] };
export type Offers = {
  next_up: (ORow & { new_unit: boolean }) | null;
  tiers: OTier[];
  session_id: string;
  on_date: string;
  /** Whether a coordinator has said this subject's teaching order is right; until then the whole subject is offered and nothing is "next". */
  ordered: boolean;
  lo_code: string | null;
  lo_title: string | null;
  activity_code: string | null;
  /** Who chose what the lesson holds: a person, or the machine's suggestion. */
  source: "machine" | "person";
  activities_for: string | null;
  activities: { code: string; name: string; strand: string }[];
};
export type Asked<T> = { ok: true; data: T } | { ok: false; why: string; refused?: boolean };

const words = async (res: Response, fallback: string) => {
  const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
  return typeof body.detail === "string" ? body.detail : fallback;
};

/** The lesson's offers as `actor` may see them. `refused`: the engine said this person does not choose for this lesson (403). */
export async function offersOf(actor: string, sessionId: string, lo?: string | null): Promise<Asked<Offers>> {
  try {
    const res = await engineSend("/timetable/lesson/next", { actor, session_id: sessionId, lo_code: lo ?? null });
    if (!res.ok) return { ok: false, why: await words(res, "What this lesson can teach could not be read."), refused: res.status === 403 };
    return { ok: true, data: (await res.json()) as Offers };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, why: e.message };
    throw e;
  }
}

export type Place = { classId: string; week: "A" | "B"; periodId: string; weekday: number; subject: string | null };
export type Dated = { id: string; day: string; fortnight: number };

/** The dated lesson a place in the pattern stands for: the next lesson of the class in that period, weekday and week (A is a fortnight's
 *  first week) from today on. None while no fortnight ahead is published: a pattern has no dates, and an objective belongs to a dated lesson. */
export async function lessonAt(p: Place): Promise<Dated | null> {
  const today = await schoolToday();
  const [row] = await sql<Dated[]>`
    select s.id::text as id, d.on_date::text as day, f.number as fortnight
    from session s join school_day d on d.id = s.school_day_id
      join school_class c on c.id = s.school_class_id
      join fortnight f on f.academic_year_id = c.academic_year_id and f.kind = 'teaching' and d.on_date between f.starts_on and f.ends_on
    where s.school_class_id = ${p.classId} and s.period_id = ${p.periodId} and extract(isodow from d.on_date) = ${p.weekday}
      and (case when d.on_date - f.starts_on < 7 then 'A' else 'B' end) = ${p.week} and d.on_date >= ${today}::date and d.kind <> 'holiday'
    order by d.on_date limit 1`;
  return row ?? null;
}

/** Any lesson of the class in the subject (the newest): the engine reads "next up" for a class and subject through one of its lessons. */
export async function anyLessonOf(classId: string, subject: string): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    select s.id::text as id from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${classId} and s.subject_code = ${subject} and s.kind <> 'fixed' order by d.on_date desc limit 1`;
  return row?.id ?? null;
}
