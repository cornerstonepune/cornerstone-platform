import { sql } from "./db";
import { grades } from "./queries";
import type { Session } from "./auth";
import { classRolls, lessonActivity, lessonLevels, lessonOffers, pageOf, periodOf } from "./educator/data";
import { childrenByIds, classChildren, rosterOf } from "./notes-loop";
import { lastTime, mayRead, sessionOf } from "./period";
import { isCoordinator } from "./timetable-ui";
import { myVoice, voiceOn } from "./voice";
import { classWords } from "./voice-types";

// One lesson, read once for wherever it is shown: its own page (/period/[id]) and the lesson panel beside the timetable (page charter A2,
// B4). The session, the activity in full (the engine's own words), the activity's page parts, what the coordinator may give it, the
// class's roll and the names the person may see, the last time the class did it, and the planner's lines. Nothing is decided here that
// the engine decides; a read the engine refuses is read as none.
export type LessonView = NonNullable<Awaited<ReturnType<typeof lessonView>>>;

export async function lessonView(me: Session, id: string) {
  const s = await sessionOf(id);
  if (!s || !(await mayRead(me, s.section))) return null;
  const klass = classWords({ ...s, gradeName: (await grades()).name(s.grade) });
  const voice = await voiceOn();
  const mine = voice ? !!(await myVoice(me))?.classes.some((x) => x.id === s.class_id) : false;
  const a = s.activity;
  const coordinator = await isCoordinator();
  const at = { class_id: s.class_id, day: s.day, period_id: s.period_id };
  // the roll of the day is read for anyone who may read the lesson (the coordinator too, CP-49): it is Sr. Nos. only; the names beside them
  // are read through rosterOf, which names only the children the person may see
  const [lesson, offers, rolls, page, last, period, marked] = await Promise.all([
    s.kind === "fixed" ? null : lessonActivity(me, at).catch(() => null),
    coordinator && s.kind !== "fixed" ? lessonOffers(me, id).catch(() => null) : null,
    a ? classRolls(me, s.class_id, s.day).catch(() => [] as string[]) : ([] as string[]),
    a ? pageOf(me, a.code).catch(() => null) : null,
    a ? lastTime(s.class_id, a.code, s.day) : null,
    periodOf(me, at).catch(() => null),
    a ? lessonLevels(me, { class_id: s.class_id, session_id: id }).catch(() => []) : [],
  ]);
  // the roll of the day is the voice screens' read (/voice/class), refused while they are off; the levels are not behind that switch (CP-49), so
  // the grid then takes the class's children as they are enrolled now
  const enrolled = a ? await classChildren(s.class_id) : [];
  if (a && !rolls.length) rolls.push(...enrolled.map((r) => String(Number(r.roll_no))).sort((x, y) => Number(x) - Number(y)));
  const roster = rolls.length ? await rosterOf(me, s.class_id).catch(() => undefined) : undefined;
  // each Sr. No.'s child id, which the levels are saved and read by (CP-49)
  const childOf: Record<string, string> = a && rolls.length ? Object.fromEntries(enrolled.map((r) => [String(Number(r.roll_no)), r.id])) : {};
  const named = last ? await childrenByIds(me, last.named.flatMap((n) => n.children)) : {};
  const part = (name: string) => page?.parts.find((p) => p.part === name);
  return {
    s,
    a,
    klass,
    voice,
    mine,
    coordinator,
    full: lesson?.activity ?? null,
    offers,
    rolls,
    roster,
    childOf,
    marked,
    page,
    last,
    named,
    period,
    planner: period?.plan_lines ?? [],
    objective: part("objective"),
    steps: part("steps"),
    thinking: part("thinking"),
  };
}

/** The lesson (session) of each placed block of a class on the days shown, by `day~period`: one read, so each block can open its panel by
 *  the lesson's own id (`?open=lesson:<id>`). */
export async function lessonIds(classId: string, days: readonly string[]): Promise<Map<string, string>> {
  if (!days.length) return new Map();
  const rows = await sql<{ id: string; day: string; period_id: string }[]>`
    select s.id::text as id, d.on_date::text as day, s.period_id::text as period_id
    from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${classId} and d.on_date = any(${days as string[]}::date[])`;
  return new Map(rows.map((r) => [`${r.day}~${r.period_id}`, r.id]));
}
