// The Children screens' reads (UI-3b): the table of children, a class's picture on one skill, and one child's page. Server only.
// Who sees what is the database's `staff_sees` (lib/reach.ts); a child's name is read through `pii.read_child`, which logs who
// asked. Nothing here decides a state: the graph's `child_skill_state` rows and the school's `child_state` colours are read.
import { sql } from "./db";
import { seesClass, type Who } from "./reach";
import { countsOf, stripOf, type Row } from "./children-view";

export type Me = Who & { email: string };

/** Not seen for this many days is "needs attention". UI-3b gap: the school's window has no setting yet (config key
 *  `children.attention_days` asked of backend, 10 Nov 2026); until it lands this is the one place the number is written. */
export const ATTENTION_DAYS = 14;
/** School days the strip of absences shows. */
export const STRIP_DAYS = 7;

export type Table = { today: string; rows: Row[]; classes: { id: string; section: string }[]; waiting: null };

type Base = { id: string; class_id: string; section: string; roll_no: string; first_name: string | null; last_name: string | null };
type State = { child_id: string; skill_code: string; colour: string; kind: string; last_seen: string | null };

/** Every child the person sees (their own classes; every class for the coordinator), with how they are doing, when they were last
 *  seen, and the strip of absences noted. `waiting` is null: notes waiting per child need `pii.note_claim.child_id`, not on main. */
export async function childrenTable(me: Me): Promise<Table> {
  const [{ today, zone }] = await sql<{ today: string; zone: string }[]>`
    select (now() at time zone z.zone)::date::text as today, z.zone
    from (select coalesce((select value #>> '{}' from config where key = 'school.time_zone'), 'UTC') as zone) z`;
  const kids = await sql<Base[]>`
    select c.id, c.class_id, c.section, c.roll_no, n.first_name, n.last_name
    from child_now c cross join lateral pii.read_child(c.id, ${me.email}) n
    where c.active and c.class_id is not null and ${seesClass(me, sql`c.section`)}`;
  if (kids.length === 0) return { today, rows: [], classes: [], waiting: null };
  const ids = kids.map((k) => k.id);
  const classIds = [...new Set(kids.map((k) => k.class_id))];
  const states = await sql<State[]>`
    select s.child_id, s.skill_code, cs.colour, s.kind, (s.last_seen at time zone ${zone})::date::text as last_seen
    from child_skill_state s join child_state cs on cs.tenant_id = s.tenant_id and cs.code = s.state
    where s.child_id = any(${ids}::uuid[]) and s.kind in ('observed', 'written')`;
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
      strip: stripOf(daysOf.get(k.class_id) ?? [], new Set((absentOf.get(k.id) ?? []).map((a) => a.date))),
    };
  });
  const classes = [...new Map(kids.map((k) => [k.class_id, k.section])).entries()].map(([id, section]) => ({ id, section })).sort((a, b) => a.section.localeCompare(b.section, "en", { numeric: true }));
  return { today, rows, classes, waiting: null };
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
