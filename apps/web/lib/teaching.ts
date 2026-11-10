// What the teaching pages read (UI-3c: activity, objective, skill). Server only. A state is the graph's (`child_skill_state`, kind
// observed for a class that has such rows, else written) and the school's colour of it (`child_state.colour`) says how it looks;
// nothing here decides a state. A class is the person's by `staff_sees` (`seesClass`), names come through `pii.read_child`.
import type { Session } from "./auth";
import { sql } from "./db";
import { PART_KEYS, type PagePart } from "./page-part";
import { seesClass } from "./reach";
import { schoolZone } from "./school-clock";

export type Me = Pick<Session, "email" | "role" | "classes" | "subjects" | "id">;
/** How a seen state looks, by the colour of its `child_state` row alone (no state is named in code): green, amber, or any other. */
export type Look = "green" | "amber" | "other";
export const lookOfColour = (colour: string): Look => (colour === "green" ? "green" : colour === "amber" ? "amber" : "other");

// built when asked, never at import: `next build` loads every route with no database
const current = () => sql`not exists (select 1 from activity_observation s where s.supersedes = o.id)`;

// ---- Activity ------------------------------------------------------------------------------------------------------

export type ActivityFacts = {
  objectives: { code: string; title: string }[];
  /** How the class sat the last time it ran: the day, the class, and the children at each level. */
  last: { day: string; section: string; levels: { level: number; n: number }[]; children: number } | null;
  taught: { last: string | null; children: number; times: number; outcomes: { outcome: string; n: number }[] };
};

export async function activityFacts(me: Me, code: string): Promise<ActivityFacts> {
  const zone = await schoolZone();
  const objectives = await sql<{ code: string; title: string }[]>`
    select l.code, l.title from activity_objective a join learning_objective l on l.tenant_id = a.tenant_id and l.code = a.lo_code
    where a.activity_code = ${code} order by a.ord`;
  const own = await sql<{ id: string; section: string }[]>`select c.id, c.label as section from school_class c where ${seesClass(me, sql`c.label`)}`;
  const ids = own.map((c) => c.id);
  const rows = await sql<{ class_id: string; day: string; child_id: string; outcome: string; level: number | null; at: string }[]>`
    select o.class_id, (o.observed_at at time zone ${zone})::date::text as day, o.child_id, o.outcome, o.reached_level as level, o.observed_at::text as at
    from activity_observation o where o.activity_code = ${code} and o.class_id = any(${ids}::uuid[]) and ${current()}`;
  const latest = rows.reduce<{ class_id: string; day: string; at: string } | null>((m, r) => (!m || r.at > m.at ? r : m), null);
  const sitting = latest ? rows.filter((r) => r.class_id === latest.class_id && r.day === latest.day && r.level !== null) : [];
  const levels = [0, 1, 2, 3].map((level) => ({ level, n: new Set(sitting.filter((r) => r.level === level).map((r) => r.child_id)).size }));
  const outcomes = new Map<string, number>();
  for (const r of rows) outcomes.set(r.outcome, (outcomes.get(r.outcome) ?? 0) + 1);
  return {
    objectives,
    last: latest ? { day: latest.day, section: own.find((c) => c.id === latest.class_id)?.section ?? "", levels, children: new Set(sitting.map((r) => r.child_id)).size } : null,
    taught: {
      last: latest ? latest.day : null,
      children: new Set(rows.map((r) => r.child_id)).size,
      times: new Set(rows.map((r) => `${r.class_id}/${r.day}`)).size,
      outcomes: [...outcomes].map(([outcome, n]) => ({ outcome, n })).sort((a, b) => b.n - a.n),
    },
  };
}

// ---- Objective -----------------------------------------------------------------------------------------------------

export type ObjectiveSkill = { code: string; name: string; after: string[] };
export type ObjectiveActivity = { code: string; name: string; strand: string; band: string; last: string | null };
export type ObjectivePage = { code: string; title: string; band: string; subject: string; skills: ObjectiveSkill[]; activities: ObjectiveActivity[] };

export async function objectiveOf(me: Me, code: string): Promise<ObjectivePage | null> {
  const zone = await schoolZone();
  const [lo] = await sql<{ code: string; title: string; band: string; subject: string }[]>`select code, title, band, subject from learning_objective where code = ${code}`;
  if (!lo) return null;
  const skills = await sql<{ code: string; name: string }[]>`
    select r.code, r.name from learning_objective_skill s join registry_skill r on r.tenant_id = s.tenant_id and r.code = s.skill_code
    where s.lo_code = ${code} order by r.name`;
  // a prerequisite is read only when a person confirmed the link (skill_link_confirmed is the view over the approved ones)
  const links = await sql<{ skill_code: string; name: string }[]>`
    select l.skill_code, r.name from skill_link_confirmed l join registry_skill r on r.tenant_id = l.tenant_id and r.code = l.before_code
    where l.skill_code = any(${skills.map((s) => s.code)}::text[]) order by r.name`;
  const own = await sql<{ id: string }[]>`select c.id from school_class c where ${seesClass(me, sql`c.label`)}`;
  const activities = await sql<ObjectiveActivity[]>`
    select a.code, a.name, a.strand, a.band,
      (select (max(o.observed_at) at time zone ${zone})::date::text from activity_observation o
        where o.activity_code = a.code and o.class_id = any(${own.map((c) => c.id)}::uuid[]) and ${current()}) as last
    from activity_objective x join activity a on a.tenant_id = x.tenant_id and a.code = x.activity_code
    where x.lo_code = ${code} order by x.ord, a.name`;
  return { ...lo, skills: skills.map((s) => ({ ...s, after: links.filter((l) => l.skill_code === s.code).map((l) => l.name) })), activities };
}

// ---- Skill ---------------------------------------------------------------------------------------------------------

export type Kid = { id: string; roll: string; name: string; look: Look | "unseen" };
export type SkillPage = {
  code: string;
  name: string;
  domain: string;
  classes: { id: string; section: string }[];
  /** The class on show: the one named, else the person's only one; null when they hold several and named none. */
  cls: { id: string; section: string } | null;
  kids: Kid[];
  objectives: { code: string; title: string }[];
  after: { code: string; name: string }[];
  next: { code: string; name: string }[];
  /** Per-level sentences of a grade 1 to 4 skill: the rows of skill_level that point at this registry skill. */
  levels: { difficulty: string; looks_like: string }[];
  rebuilt: string | null;
};

export async function skillOf(me: Me, code: string, classId: string | undefined): Promise<SkillPage | null> {
  const zone = await schoolZone();
  const [rs] = await sql<{ code: string; name: string; domain: string | null }[]>`select code, name, domain from registry_skill where code = ${code}`;
  if (!rs) return null;
  const classes = await sql<{ id: string; section: string }[]>`select c.id, c.label as section from school_class c where ${seesClass(me, sql`c.label`)} order by c.label`;
  const cls = classId ? (classes.find((c) => c.id === classId) ?? null) : classes.length === 1 ? classes[0] : null;
  const kids: Kid[] = [];
  if (cls) {
    const children = await sql<{ id: string; roll: string; name: string }[]>`
      select c.id, c.roll_no as roll, concat_ws(' ', n.first_name, n.last_name) as name
      from child_now c cross join lateral pii.read_child(c.id, ${me.email}) n
      where c.class_id = ${cls.id}::uuid and c.active`;
    // a class that has observed states (K2) is read on those; otherwise on the written ones. Each statement names its kind.
    const ids = children.map((c) => c.id);
    type StateRow = { child_id: string; colour: string };
    let states = await sql<StateRow[]>`
      select s.child_id, cs.colour from child_skill_state s join child_state cs on cs.tenant_id = s.tenant_id and cs.code = s.state
      where s.kind = 'observed' and s.skill_code = ${code} and s.child_id = any(${ids}::uuid[])`;
    if (!states.length)
      states = await sql<StateRow[]>`
        select s.child_id, cs.colour from child_skill_state s join child_state cs on cs.tenant_id = s.tenant_id and cs.code = s.state
        where s.kind = 'written' and s.skill_code = ${code} and s.child_id = any(${ids}::uuid[])`;
    for (const c of children) {
      const s = states.find((x) => x.child_id === c.id);
      kids.push({ ...c, look: s ? lookOfColour(s.colour) : "unseen" });
    }
    kids.sort((a, b) => Number(a.roll) - Number(b.roll));
  }
  const objectives = await sql<{ code: string; title: string }[]>`
    select l.code, l.title from learning_objective_skill s join learning_objective l on l.tenant_id = s.tenant_id and l.code = s.lo_code where s.skill_code = ${code} order by l.title`;
  const after = await sql<{ code: string; name: string }[]>`
    select r.code, r.name from skill_link_confirmed l join registry_skill r on r.tenant_id = l.tenant_id and r.code = l.before_code where l.skill_code = ${code} order by r.name`;
  const next = await sql<{ code: string; name: string }[]>`
    select r.code, r.name from skill_link_confirmed l join registry_skill r on r.tenant_id = l.tenant_id and r.code = l.skill_code where l.before_code = ${code} order by r.name`;
  const levels = await sql<{ difficulty: string; looks_like: string }[]>`
    select l.difficulty, l.looks_like from skill_level l join skill k on k.tenant_id = l.tenant_id and k.code = l.skill_code
    where ${code} = any(k.registry_codes) and coalesce(l.looks_like, '') <> '' order by l.difficulty`;
  const [run] = await sql<{ at: string }[]>`select (finished_at at time zone ${zone})::text as at from flow_run where flow = 'graph_nightly' and finished_at is not null order by finished_at desc limit 1`;
  return { code: rs.code, name: rs.name, domain: rs.domain ?? "", classes, cls, kids, objectives, after, next, levels, rebuilt: run?.at ?? null };
}

// ---- An activity's parts, read from the rows --------------------------------------------------------------------------
// As the engine's page read does it (`w1_bank/k2_page.read`), minus its gate: the K2 educator switch decides whether the
// timetable screens are shown, not whether a person may read what the school wrote about an activity. Answering a drafted part
// still goes through the engine, which asks for the review role.

export type ActivityPage = { code: string; name: string; section: string; parts: PagePart[]; materials: { text: string; items: { name: string; quantity: number | null; unit: string }[] } };

export async function activityPage(code: string): Promise<ActivityPage | null> {
  const [row] = await sql<Record<string, unknown>[]>`
    select code, name, strand, materials, objective, steps, thinking, level_0, level_1, level_2, level_3, steps_list, thinking_doc from activity where code = ${code}`;
  if (!row) return null;
  const marks = await sql<{ part: string; source: string; check_me: boolean }[]>`select part, source, check_me from activity_part_source where activity_code = ${code}`;
  const parts = PART_KEYS.filter((p) => p !== "materials").map((p): PagePart => {
    const text = String(row[p] ?? "").trim();
    const mark = marks.find((m) => m.part === p);
    const list = p === "steps" ? row.steps_list : null;
    const doc = p === "thinking" ? (row.thinking_doc as { idea?: string; slips?: { keyword: string; spot: string }[] } | null) : null;
    return {
      part: p,
      kind: p === "steps" ? "bullets" : p === "thinking" ? "thinking" : "text",
      source: text ? ((mark?.source ?? "school") as PagePart["source"]) : "",
      check_me: Boolean(mark?.check_me),
      text,
      items: p === "steps" ? (Array.isArray(list) && list.every((x) => typeof x === "string") ? (list as string[]) : text.split("\n").map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim()).filter(Boolean)) : [],
      idea: doc && typeof doc.idea === "string" ? doc.idea : null,
      slips: doc && Array.isArray(doc.slips) ? doc.slips : [],
    };
  });
  const items = await sql<{ name: string; quantity: number | null; unit: string }[]>`
    select i.name, m.quantity::float8 as quantity, i.unit from activity_material m join material_item i on i.tenant_id = m.tenant_id and i.code = m.material_code
    where m.activity_code = ${code} order by m.ord`;
  return { code: String(row.code), name: String(row.name), section: String(row.strand), parts, materials: { text: String(row.materials ?? "").trim(), items } };
}
