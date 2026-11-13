// The class picture and one child's page (UI-3b). Server only. A state is the graph's (`child_skill_state`, kind observed for a class
// that has such rows, else written); the school's colour of it (`child_state.colour`) says how it looks. Nothing here decides a state.
import { sql } from "./db";
import { seesClass } from "./reach";
import { attentionDays, stateRows, type Me } from "./children-reads";

import { SECURE, lookOfColour, type Look } from "./looks";
export type { Look };

/** How many times a child was seen on a skill: the days a confirmed observation of it was made (the K2 graph), or the answers behind it (the written
 *  graph). Counted from the evidence, not read off the state row, whose `named_days` counts only the days that opened secure. */
const seenSql = () => sql`case when s.kind = 'observed'
  then (select count(distinct e.observed_at::date) from evidence_event e where e.child_id = s.child_id and e.skill_code = s.skill_code and e.kind = 'observed' and e.confirmed_by is not null)
  else coalesce(s.n_events, 0) end::int`;

export type Kid = { id: string; roll: string; name: string };
export type Skill = { code: string; name: string; domain: string; seen: number };
export type Cell = { look: Look; colour: string; words: string; lastSeen: string | null; seen: number };
export type Picture = {
  classId: string;
  section: string;
  today: string;
  rebuilt: string | null;
  kids: Kid[];
  skills: Skill[];
  /** child id → skill code → the state of the child on that skill */
  cells: Map<string, Map<string, Cell>>;
  /** child id → the skills the child was seen on, any */
  anySeen: Map<string, string | null>;
  next: Map<string, string[]>;
  /** skill code → the skills a person confirmed as linked to it, either way round */
  related: Map<string, Set<string>>;
  days: number;
};

/** The class if it is the person's to see; null otherwise (the same answer as no such class). */
export async function classOf(me: Me, classId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(classId)) return null;
  const [c] = await sql<{ id: string; section: string }[]>`select c.id, c.label as section from school_class c where c.id = ${classId}::uuid and ${seesClass(me, sql`c.label`)}`;
  return c ?? null;
}

export async function pictureOf(me: Me, classId: string): Promise<Picture | null> {
  const cls = await classOf(me, classId);
  if (!cls) return null;
  const [{ today, zone }] = await sql<{ today: string; zone: string }[]>`
    select (now() at time zone z.zone)::date::text as today, z.zone from (select coalesce((select value #>> '{}' from config where key = 'school.time_zone'), 'UTC') as zone) z`;
  const kids = await sql<Kid[]>`
    select c.id, c.roll_no as roll, concat_ws(' ', n.first_name, n.last_name) as name
    from child_now c cross join lateral pii.read_child(c.id, ${me.email}) n
    where c.class_id = ${classId}::uuid and c.active`;
  const rows = await sql<{ child_id: string; skill_code: string; name: string; domain: string | null; colour: string; words: string; kind: string; seen: number; last_seen: string | null }[]>`
    select s.child_id, s.skill_code, rs.name, rs.domain, cs.colour, cs.words, s.kind, ${seenSql()} as seen, (s.last_seen at time zone ${zone})::date::text as last_seen
    from (${stateRows(kids.map((k) => k.id))}) s join child_state cs on cs.tenant_id = s.tenant_id and cs.code = s.state
    join registry_skill rs on rs.tenant_id = s.tenant_id and rs.code = s.skill_code`;
  const kind = rows.some((r) => r.kind === "observed") ? "observed" : "written";
  const mine = rows.filter((r) => r.kind === kind);
  const cells = new Map<string, Map<string, Cell>>();
  const anySeen = new Map<string, string | null>();
  const skills = new Map<string, Skill>();
  for (const r of mine) {
    const row = cells.get(r.child_id) ?? new Map<string, Cell>();
    row.set(r.skill_code, { look: lookOfColour(r.colour), colour: r.colour, words: r.words, lastSeen: r.last_seen, seen: r.seen });
    cells.set(r.child_id, row);
    const was = anySeen.get(r.child_id) ?? null;
    anySeen.set(r.child_id, r.last_seen && (!was || r.last_seen > was) ? r.last_seen : was);
    const s = skills.get(r.skill_code) ?? { code: r.skill_code, name: r.name, domain: r.domain ?? "", seen: 0 };
    s.seen++;
    skills.set(r.skill_code, s);
  }
  const links = await sql<{ before_code: string; skill_code: string }[]>`select before_code, skill_code from skill_link_confirmed`;
  const next = new Map<string, string[]>();
  const related = new Map<string, Set<string>>();
  for (const l of links) {
    next.set(l.before_code, [...(next.get(l.before_code) ?? []), l.skill_code]);
    related.set(l.before_code, (related.get(l.before_code) ?? new Set()).add(l.skill_code));
    related.set(l.skill_code, (related.get(l.skill_code) ?? new Set()).add(l.before_code));
  }
  const [run] = await sql<{ at: string }[]>`select (finished_at at time zone ${zone})::text as at from flow_run where flow = 'graph_nightly' and finished_at is not null order by finished_at desc limit 1`;
  return {
    classId,
    section: cls.section,
    today,
    rebuilt: run?.at ?? null,
    kids,
    skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name, "en")),
    cells,
    anySeen,
    next,
    related,
    days: await attentionDays(),
  };
}

export type ChildSkill = { code: string; name: string; domain: string; look: Look; colour: string; words: string; seen: number; lastSeen: string | null; readyNext: string[] };

/** One child's skills in domain then skill order, each with the times it was seen (named days for observed, events for written). */
export async function skillsOfChild(childId: string): Promise<ChildSkill[]> {
  const rows = await sql<{ skill_code: string; name: string; domain: string | null; colour: string; words: string; kind: string; seen: number; last_seen: string | null }[]>`
    select s.skill_code, rs.name, rs.domain, cs.colour, cs.words, s.kind, ${seenSql()} as seen, s.last_seen::date::text as last_seen
    from (${stateRows([childId])}) s join child_state cs on cs.tenant_id = s.tenant_id and cs.code = s.state
    join registry_skill rs on rs.tenant_id = s.tenant_id and rs.code = s.skill_code`;
  const kind = rows.some((r) => r.kind === "observed") ? "observed" : "written";
  const mine = rows.filter((r) => r.kind === kind);
  const links = await sql<{ before_code: string; skill_code: string; name: string }[]>`
    select l.before_code, l.skill_code, rs.name from skill_link_confirmed l join registry_skill rs on rs.tenant_id = l.tenant_id and rs.code = l.skill_code`;
  const secure = new Set(mine.filter((r) => lookOfColour(r.colour) === SECURE).map((r) => r.skill_code));
  const seen = new Set(mine.map((r) => r.skill_code));
  return mine
    .map((r): ChildSkill => ({
      code: r.skill_code,
      name: r.name,
      domain: r.domain ?? "",
      look: lookOfColour(r.colour),
      colour: r.colour,
      words: r.words,
      seen: r.seen,
      lastSeen: r.last_seen,
      // ready next: a skill after this one, by a confirmed link, that the child has not been seen on, while this one is secure
      readyNext: secure.has(r.skill_code) ? links.filter((l) => l.before_code === r.skill_code && !seen.has(l.skill_code)).map((l) => l.name) : [],
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain, "en") || a.name.localeCompare(b.name, "en"));
}

/** A sitting per level named for a child on one skill, oldest first: the level reached on each confirmed observation of it. */
export async function sittingsOf(childId: string, skillCode: string): Promise<{ date: string; level: number }[]> {
  return sql<{ date: string; level: number }[]>`
    select o.observed_at::date::text as date, o.reached_level as level
    from evidence_event v join activity_observation o on o.id = v.observation_id
    where v.child_id = ${childId}::uuid and v.skill_code = ${skillCode} and v.confirmed_by is not null
      and o.reached_level is not null and not exists (select 1 from activity_observation c where c.supersedes = o.id)
    order by o.observed_at`;
}
