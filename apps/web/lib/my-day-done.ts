// What was finished in a period, for My day's Done column (CP-69). One batched read: each kind that records being finished is asked once, over
// the days the period covers (`windowOf`, in the school's own clock), and comes back as counts for each class with the time of the latest. A kind
// that records no finish is not here (the pull request lists them): "Note to record", "Lessons not done last week". Notes are read through the
// engine (`myFinishedNotes`: names and notes stay in pii), every other kind from the rows that say who finished and when.
import type { Session } from "./auth";
import { deadline } from "./deadline";
import { sql } from "./db";
import { grades } from "./queries";
import { seesClass, seesSheet } from "./reach";
import { schoolZone } from "./school-clock";
import { myFinishedNotes } from "./today-data";
import type { Window } from "./my-day";
import type { Kind } from "./todo";
import { classWords } from "./voice-types";

/** `kind`: a task kind, or one of the coordinator's own ("clash", "draft"). `section`: the class as its tasks name it, "" for the school's. */
export type Finished = { kind: Kind | "clash" | "draft"; section: string; n: number; at: string };

type Row = { section: string | null; n: number; at: Date | string };
const rows = (kind: Finished["kind"], got: Row[]): Finished[] => got.map((r) => ({ kind, section: r.section ?? "", n: r.n, at: new Date(r.at).toISOString() }));

/** Everything finished in the window that this person may see. A read that fails or is too slow is left out, never a made-up zero. */
export async function finishedIn(me: Session, w: Window, school: boolean): Promise<Finished[]> {
  const zone = await schoolZone();
  // a timestamp's school day lies in [from, to)
  const inside = (col: ReturnType<typeof sql>) => sql`(${col} at time zone ${zone})::date >= ${w.from}::date and (${col} at time zone ${zone})::date < ${w.to}::date`;
  const [checked, signed, approved, made, asked, clashes, drafts, taught, notes, names] = await Promise.all([
    sql<Row[]>`select ch.section, count(*)::int as n, max(rc.created_at) as at from read_correction rc join child_now ch on ch.id = rc.child_id
               where ${inside(sql`rc.created_at`)} and ${seesClass(me, sql`ch.section`)} group by ch.section`,
    sql<Row[]>`select coalesce(si.section, ch.section) as section, count(*)::int as n, max(r.confirmed_at) as at
               from item_result r join capture c on c.id = r.capture_id join sheet_instance si on si.id = c.sheet_instance_id
               left join child_now ch on ch.id = si.child_id
               where r.confirmed_by is not null and ${inside(sql`r.confirmed_at`)} and ${seesSheet(me, sql`si.id`)} group by 1`,
    sql<(Row & { home: boolean })[]>`select coalesce(si.section, ch.section) as section, (si.kind = 'focus') as home, count(*)::int as n, max(si.approved_at) as at
               from sheet_instance si left join child_now ch on ch.id = si.child_id
               where si.approved_at is not null and ${inside(sql`si.approved_at`)} and ${seesSheet(me, sql`si.id`)} group by 1, 2`,
    sql<Row[]>`select coalesce(si.section, ch.section) as section, count(distinct si.sheet_template_id)::int as n, max(si.created_at) as at
               from sheet_instance si left join child_now ch on ch.id = si.child_id
               where si.kind = 'assessment' and si.print_status <> 'void' and ${inside(sql`si.created_at`)} and ${seesSheet(me, sql`si.id`)} group by 1`,
    sql<Row[]>`select null::text as section, count(*)::int as n, max(answered_at) as at from ask
               where answered_at is not null and for_role = ${me.role} and ${inside(sql`answered_at`)}`,
    school ? sql<Row[]>`select null::text as section, count(*)::int as n, max(created_at) as at from approval where kind = 'timetable_clash' and ${inside(sql`created_at`)}` : [],
    school ? sql<Row[]>`select null::text as section, count(*)::int as n, max(created_at) as at from approval where kind = 'timetable_live' and ${inside(sql`created_at`)}` : [],
    // topics marked taught: a class's own word on a skill is `{by, at}`; counted by topic, so a topic with six skills is one
    sql<Row[]>`select sc.section, count(distinct s.topic_code)::int as n, max((w.v ->> 'at')::timestamptz) as at
               from school_class sc cross join lateral jsonb_each(coalesce(sc.taught, '{}'::jsonb)) as w(code, v)
               join skill s on s.tenant_id = sc.tenant_id and s.code = w.code
               where jsonb_typeof(w.v) = 'object' and w.v ->> 'at' is not null and ${inside(sql`(w.v ->> 'at')::timestamptz`)} and ${seesClass(me, sql`sc.section`)}
               group by sc.section`,
    deadline(myFinishedNotes(me, w.from, w.to)).catch(() => null),
    grades(),
  ]);
  const noted = notes?.ok ? notes.value.rows.map((r) => ({ kind: "note" as const, section: classWords({ grade: r.grade, section: r.section, gradeName: names.name(r.grade) }), n: r.n, at: r.at })) : [];
  return [
    ...rows("check", checked),
    ...rows("signoff", signed),
    ...approved.flatMap((r) => rows(r.home ? "home" : "classpaper", [r])),
    ...rows("generate", made),
    ...rows("ask", asked),
    ...rows("clash", clashes),
    ...rows("draft", drafts),
    ...rows("taught", taught),
    ...noted,
  ].filter((f) => f.n > 0);
}
