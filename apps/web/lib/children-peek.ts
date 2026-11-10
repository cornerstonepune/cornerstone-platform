// One child's recent history for ChildPeek and the child's timeline (UI-3b): what was seen, newest first, each entry with who and
// when. Four sources are merged by date: a voice note and an observation (`activity_observation`), a paper (`item_result`), and
// the state the graph holds on a skill (`child_skill_state`). A correction is a new observation that names the one it replaces.
// A note's own words are never read here (private to the educator who recorded it): the entry says that a note was confirmed.
import { sql } from "./db";
import { seesClass } from "./reach";
import { staffList } from "./queries";
import { dateWords } from "./week";
import type { Me } from "./children-reads";
import type { Kind } from "@/components/kind-tile";

export type Entry = { kind: Kind; title: string; line: string; at: string; when: string; more?: string };

/** An outcome code said as the words of the voice note: "as_expected" → "as expected". */
const outcomeWords = (code: string) => code.replace(/_/g, " ");
const SIZE = 20;

/** The class, Sr. No. and name of a child the person may see; null when the class is not theirs or there is no such child. */
export async function childOf(me: Me, classId: string, roll: string) {
  if (!/^[0-9a-f-]{36}$/i.test(classId)) return null;
  const [c] = await sql<{ id: string; class_id: string; section: string; roll_no: string; first_name: string | null; last_name: string | null }[]>`
    select c.id, c.class_id, c.section, c.roll_no, n.first_name, n.last_name
    from child_now c cross join lateral pii.read_child(c.id, ${me.email}) n
    where c.class_id = ${classId}::uuid and c.roll_no = ${roll} and c.active and ${seesClass(me, sql`c.section`)}`;
  return c ?? null;
}

export async function historyOf(childId: string, limit = SIZE, before: string | null = null): Promise<Entry[]> {
  const people = new Map((await staffList()).map((s) => [s.id, s.name]));
  const who = (id: string | null) => (id ? (people.get(id) ?? "a member of staff") : "a member of staff");
  const seen = await sql<{ id: string; at: string; outcome: string; note_id: string | null; activity: string; confirmed_by: string | null; supersedes: string | null; replaced: string | null; route: string; mode: string; stored: string; by: string | null; opens: boolean | null }[]>`
    select o.id, o.observed_at::text as at, o.outcome, o.note_id, coalesce(a.name, o.activity_code) as activity, o.confirmed_by::text,
           o.supersedes::text, (select p.outcome from activity_observation p where p.id = o.supersedes) as replaced,
           o.route, o.entry_mode as mode, o.stored_at::text as stored, o.observed_by::text as by,
           (select (w ->> 'opens_secure')::boolean from config cf, jsonb_array_elements(cf.value -> sc.grade_code) w
             where cf.key = 'observed.weights' and w ->> 'entry_mode' = o.entry_mode and w ->> 'kind' = 'observed' limit 1) as opens
    from activity_observation o left join activity a on a.tenant_id = o.tenant_id and a.code = o.activity_code
    left join school_class sc on sc.id = o.class_id
    where o.child_id = ${childId}::uuid and (${before}::timestamptz is null or o.observed_at < ${before}::timestamptz)
    order by o.observed_at desc limit ${limit}`;
  const papers = await sql<{ capture: string; at: string; sheet: string; right: number; wrong: number; working: number; blank: number; by: string | null }[]>`
    select k.id::text as capture, max(r.confirmed_at)::text as at, si.qr_code as sheet,
           count(*) filter (where r.status = 'correct')::int as right,
           count(*) filter (where r.status = 'wrong' and r.working_shown is null)::int as wrong,
           count(*) filter (where r.status = 'wrong' and r.working_shown is not null)::int as working,
           count(*) filter (where r.status = 'blank')::int as blank, max(r.confirmed_by) as by
    from sheet_instance si join capture k on k.sheet_instance_id = si.id and k.superseded_by is null
    join item_result r on r.capture_id = k.id and r.confirmed_at is not null
    where si.child_id = ${childId}::uuid and (${before}::timestamptz is null or r.confirmed_at < ${before}::timestamptz)
    group by k.id, si.qr_code order by max(r.confirmed_at) desc limit ${limit}`;
  const states = await sql<{ skill: string; words: string; at: string }[]>`
    select rs.name as skill, cs.words, s.last_seen::text as at
    from child_skill_state s join child_state cs on cs.tenant_id = s.tenant_id and cs.code = s.state
    join registry_skill rs on rs.tenant_id = s.tenant_id and rs.code = s.skill_code
    where s.child_id = ${childId}::uuid and s.last_seen is not null and (${before}::timestamptz is null or s.last_seen < ${before}::timestamptz)
    order by s.last_seen desc limit ${limit}`;
  const out: Entry[] = [
    ...seen.map((o) => entryOf(o, who)),
    ...papers.map((p): Entry => ({
      kind: "assessment",
      title: `Paper, sheet ${p.sheet}`,
      // three signals, never collapsed: right, wrong, wrong with working, blank
      line: `${p.right} right, ${p.wrong} wrong, ${p.working} wrong with working, ${p.blank} blank · signed off by ${p.by ?? "a member of staff"}`,
      at: p.at,
      when: dateWords(p.at.slice(0, 10)),
    })),
    ...states.map((s): Entry => ({ kind: "skill", title: `${s.skill}: now ${s.words}`, line: "Where the graph holds this skill after the last sitting", at: s.at, when: dateWords(s.at.slice(0, 10)) })),
  ];
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

type Seen = { at: string; outcome: string; note_id: string | null; activity: string; confirmed_by: string | null; supersedes: string | null; replaced: string | null; route: string; mode: string; stored: string; by: string | null; opens: boolean | null };

/** One observation as an entry. A correction names the entry it replaces; the fold says who saw it, who confirmed it, both clocks,
 *  the route, and whether it counts toward secure (the school's `observed.weights` setting, read in the query). */
function entryOf(o: Seen, who: (id: string | null) => string): Entry {
  const when = dateWords(o.at.slice(0, 10));
  const more = `Observed by ${who(o.by)} (educator) · confirmed by ${who(o.confirmed_by)} · seen ${o.at.slice(0, 16).replace("T", " ")}, stored ${o.stored.slice(0, 16).replace("T", " ")} · by ${o.route} · ${o.opens === null ? "counting not set" : o.opens ? "counts toward secure" : "does not count toward secure"}`;
  if (o.supersedes) return { kind: "period", title: `A mark corrected: ${outcomeWords(o.replaced ?? "")} became ${outcomeWords(o.outcome)}`, line: `A new entry that replaces the first · ${who(o.confirmed_by)}`, at: o.at, when, more };
  const title = `${o.activity}: ${outcomeWords(o.outcome)}`;
  return o.note_id
    ? { kind: "note", title, line: `Voice note · confirmed by ${who(o.confirmed_by)}`, at: o.at, when, more }
    : { kind: "activity", title, line: `Observed in the period · ${who(o.confirmed_by)}`, at: o.at, when, more };
}
