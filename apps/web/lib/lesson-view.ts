import { sql } from "./db";
import { grades } from "./queries";
import type { Session } from "./auth";
import { classRolls, lessonActivity, lessonLevels, lessonOffers, pageOf, periodOf } from "./educator/data";
import { childrenByIds, rosterOf } from "./notes-loop";
import { lastTime, mayRead, sessionOf } from "./period";
import { isCoordinator } from "./timetable-ui";
import { myVoice, voiceOn } from "./voice";
import { classWords } from "./voice-types";

// One lesson, read once for wherever it is shown: its own page (/period/[id]) and the lesson panel beside the timetable (page charter A2,
// B4). The session, the activity in full (the engine's own words), the activity's page parts, what the coordinator may give it, the
// class's roll and the names the person may see, the last time the class did it, and the planner's lines. Nothing is decided here that
// the engine decides; a read the engine refuses is read as none.
export type LessonView = NonNullable<Awaited<ReturnType<typeof lessonView>>>;

/** `grid`: the lesson page also reads the levels and the day's roll (CP-49); the timetable's panel does not draw them, so does not read them. */
export async function lessonView(me: Session, id: string, grid = false) {
  const s = await sessionOf(id);
  if (!s || !(await mayRead(me, s.section))) return null;
  const klass = classWords({ ...s, gradeName: (await grades()).name(s.grade) });
  const voice = await voiceOn();
  const mine = voice ? !!(await myVoice(me))?.classes.some((x) => x.id === s.class_id) : false;
  const a = s.activity;
  const coordinator = await isCoordinator();
  const at = { class_id: s.class_id, day: s.day, period_id: s.period_id };
  // the voice roll (`rolls`) is for the voice note's form and is hers alone; the grid's roll comes with the levels (CP-49), the children
  // enrolled on the lesson's day as the engine's save checks them, for anyone who may read the lesson
  const [lesson, offers, rolls, page, last, period, levels] = await Promise.all([
    s.kind === "fixed" ? null : lessonActivity(me, at).catch(() => null),
    coordinator && s.kind !== "fixed" ? lessonOffers(me, id).catch(() => null) : null,
    a && mine ? classRolls(me, s.class_id, s.day).catch(() => [] as string[]) : ([] as string[]),
    a ? pageOf(me, a.code).catch(() => null) : null,
    a ? lastTime(s.class_id, a.code, s.day) : null,
    periodOf(me, at).catch(() => null),
    a && grid ? lessonLevels(me, { class_id: s.class_id, session_id: id }).catch(() => null) : null,
  ]);
  // names are read through rosterOf, which names only the children the person may see; Sr. No. is the key both share
  const roster = rolls.length || levels?.roll.length ? await rosterOf(me, s.class_id).catch(() => undefined) : undefined;
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
    levels,
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
