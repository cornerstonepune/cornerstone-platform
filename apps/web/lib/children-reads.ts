// The Children screens' reads (UI-3b): the table of children, a class's picture on one skill, and one child's page. Server only.
// Who sees what is the database's `staff_sees` (lib/reach.ts); a child's name is read through `pii.read_child`, which logs who
// asked. Nothing here decides a state: the graph's `child_skill_state` rows and the school's `child_state` colours are read.
import { sql } from "./db";
import { seesClass, workScope, type Who } from "./reach";
import { childTable } from "./queries-children";
import { reportWaits } from "./queries-reports";
import { EngineDown, engineSend } from "./engine";
import { countsOf, stripOf, type Row } from "./children-view";

export type Me = Who & { email: string };

/** Not seen for this many days is "needs attention": the school's setting `children.attention_days`. Without the row only a child
 *  never seen needs attention (no number is assumed here). */
export async function attentionDays(): Promise<number> {
  const [r] = await sql<{ days: number | null }[]>`select (select (value)::text::int from config where key = 'children.attention_days') as days`;
  return r.days ?? Number.POSITIVE_INFINITY;
}
/** School days the strip of absences shows. */
export const STRIP_DAYS = 7;

/** The states of children, of both kinds, as a statement to read from. Every statement that reads `child_skill_state` names the kind
 *  it means (tests/test_k2_picture.py): here each is named, and the caller keeps the kind a class is read on (observed if any child has
 *  such rows, else written). */
export const stateRows = (ids: readonly string[]) => sql`
  select * from child_skill_state where kind = 'observed' and child_id = any(${ids as string[]}::uuid[])
  union all
  select * from child_skill_state where kind = 'written' and child_id = any(${ids as string[]}::uuid[])`;

/** Whole counts for a class's header: answers waiting for a person and parent reports waiting. Never a score, a rank or a per-child number. */
export type ClassCounts = { answers: number; reports: number };

export type Table = { today: string; days: number; rows: Row[]; classes: { id: string; section: string }[]; counts: Record<string, ClassCounts> };

type Base = { id: string; class_id: string; section: string; roll_no: string; first_name: string | null; last_name: string | null };
type State = { child_id: string; skill_code: string; colour: string; kind: string; last_seen: string | null };

/** Every child the person sees (their own classes; every class for the coordinator), with how they are doing, when they were last
 *  seen, the strip of absences noted and the notes waiting on them (the engine's `waiting_by_child`, of the person's own notes in a
 *  class they hold; null where the engine did not answer for that class). */
export async function childrenTable(me: Me): Promise<Table> {
  const [{ today, zone }] = await sql<{ today: string; zone: string }[]>`
    select (now() at time zone z.zone)::date::text as today, z.zone
    from (select coalesce((select value #>> '{}' from config where key = 'school.time_zone'), 'UTC') as zone) z`;
  const kids = await sql<Base[]>`
    select c.id, c.class_id, c.section, c.roll_no, n.first_name, n.last_name
    from child_now c cross join lateral pii.read_child(c.id, ${me.email}) n
    where c.active and c.class_id is not null and ${seesClass(me, sql`c.section`)}`;
  const window = await attentionDays();
  if (kids.length === 0) return { today, days: window, rows: [], classes: [], counts: {} };
  const ids = kids.map((k) => k.id);
  const classIds = [...new Set(kids.map((k) => k.class_id))];
  const states = await sql<State[]>`
    select s.child_id, s.skill_code, cs.colour, s.kind, (s.last_seen at time zone ${zone})::date::text as last_seen
    from (${stateRows(ids)}) s join child_state cs on cs.tenant_id = s.tenant_id and cs.code = s.state`;
  const days = await sql<{ class_id: string; date: string; lesson: boolean }[]>`
    with sd as (
      select d.id, d.on_date, c.id as class_id
      from school_class c join school_day d on d.campus_id = c.campus_id and d.kind = 'teaching' and d.on_date <= ${today}::date
      where c.id = any(${classIds}::uuid[])),
    ranked as (select *, row_number() over (partition by class_id order by on_date desc) as n from sd)
    select r.class_id, r.on_date::text as date,
           exists (select 1 from session s where s.school_class_id = r.class_id and s.school_day_id = r.id and s.state = 'done') as lesson
    from ranked r where r.n <= ${STRIP_DAYS} order by r.class_id, r.on_date`;
  const absent = await sql<{ child_id: string; date: string }[]>`
    select o.child_id, (o.observed_at at time zone ${zone})::date::text as date
    from activity_observation o
    where o.child_id = any(${ids}::uuid[]) and o.outcome = 'absent'
      and not exists (select 1 from activity_observation c where c.supersedes = o.id)`;

  const daysOf = groupBy(days, (d) => d.class_id);
  const absentOf = groupBy(absent, (a) => a.child_id);
  const statesOf = groupBy(states, (s) => s.child_id);
  // a class is read on its observed rows if any child of it has them, else its written rows; its skills are those anyone was seen on
  const kindOf = new Map<string, string>();
  const skillsOf = new Map<string, Set<string>>();
  for (const k of kids) {
    const mine = statesOf.get(k.id) ?? [];
    if (mine.some((s) => s.kind === "observed")) kindOf.set(k.class_id, "observed");
    else if (mine.length && !kindOf.has(k.class_id)) kindOf.set(k.class_id, "written");
  }
  const seen = (k: Base) => (statesOf.get(k.id) ?? []).filter((s) => s.kind === (kindOf.get(k.class_id) ?? "observed"));
  for (const k of kids) {
    const set = skillsOf.get(k.class_id) ?? new Set<string>();
    for (const s of seen(k)) set.add(s.skill_code);
    skillsOf.set(k.class_id, set);
  }
  const waiting = await waitingByChild(me, [...new Set(kids.filter((k) => me.classes?.includes(k.section)).map((k) => k.class_id))]);
  // what the older child list showed and this one now carries: the skill a child most needs help on, and the answers and parent
  // reports waiting (`queries-children.childTable`, the one read of both)
  const old = new Map((await childTable(me.email, null, await workScope(me))).map((r) => [r.id, r]));
  const rows: Row[] = kids.map((k) => {
    const mine = seen(k);
    const last = mine.map((s) => s.last_seen).filter((d): d is string => d !== null).sort().pop() ?? null;
    return {
      childId: k.id,
      roll: k.roll_no,
      name: [k.first_name, k.last_name].filter(Boolean).join(" "),
      classId: k.class_id,
      section: k.section,
      counts: countsOf(
        mine.map((s) => s.colour),
        skillsOf.get(k.class_id)?.size ?? 0,
      ),
      lastSeen: last,
      waiting: waiting.has(k.class_id) ? (waiting.get(k.class_id)!.get(k.id) ?? 0) : null,
      helpOn: old.get(k.id)?.help?.name ?? null,
      strip: stripOf(daysOf.get(k.class_id) ?? [], new Set((absentOf.get(k.id) ?? []).map((a) => a.date))),
    };
  });
  const classes = [...new Map(kids.map((k) => [k.class_id, k.section])).entries()].map(([id, section]) => ({ id, section })).sort((a, b) => a.section.localeCompare(b.section, "en", { numeric: true }));
  const counts: Record<string, ClassCounts> = {};
  for (const k of kids) {
    const o = old.get(k.id);
    const c = (counts[k.class_id] ??= { answers: 0, reports: 0 });
    c.answers += o?.waiting ?? 0;
    c.reports += o && reportWaits(o.report) ? 1 : 0;
  }
  return { today, days: window, rows, classes, counts };
}

function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

/** The educator switch: while `voice.screens_enabled` is off these screens show no child, as the K2 pages never did (the engine
 *  refused them with "Voice notes are not switched on."). Locked by tests/u72-children.spec.ts, migrated from m1-17. */
export async function screensOn(): Promise<boolean> {
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select (value)::text = 'true' from config where key = 'voice.screens_enabled'), false) as on`;
  return r.on;
}
export const SWITCHED_OFF = "Voice notes are not switched on.";

/** Notes waiting on each child, by class, as the engine counts them for the person's own notes (`POST /voice/class-notes`). A class
 *  the engine would not answer for (not held, switch off, engine down) is left out, so its children read "not available". */
async function waitingByChild(me: Me, classIds: string[]): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  await Promise.all(
    classIds.map(async (id) => {
      try {
        const res = await engineSend("/voice/class-notes", { actor: me.email, class_id: id });
        if (!res.ok) return;
        const body = (await res.json()) as { waiting_by_child?: Record<string, number> };
        out.set(id, new Map(Object.entries(body.waiting_by_child ?? {})));
      } catch (e) {
        if (!(e instanceof EngineDown)) throw e;
      }
    }),
  );
  return out;
}
