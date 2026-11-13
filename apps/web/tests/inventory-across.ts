// What the Across dashboard (page charter Part C) needs in the inventory run: the fixture class with each of the three things the page counts, so a
// class's panel draws every control it can: an answer waiting for a person over 48 hours (Check them), a paper given 5 days ago and not back (the
// paper's code), and a child needing help in two subjects (the child's name). Built from the test's own rows, as tests/s43-across-classes.spec.ts
// builds them, and put away by `acrossGone`: the papers are voided as a paper made in error is, the second subject and the red states are deleted.
import { randomBytes } from "node:crypto";
import type { Sql } from "postgres";
import { aReadPaper } from "./rows";

type Aside = <T>(f: (sql: Sql) => Promise<T>) => Promise<T>;

const SUBJECT = "U70ACR";
let RUN = "0000";
let RED = "";

export const acrossRest = (aside: Aside, SECTION: string) =>
  aside(async (sql) => {
    RUN = randomBytes(2).toString("hex").toUpperCase();
    const code = (n: string) => `CS${RUN}${n}`;
    const kids = await sql<{ id: string; tenant: string }[]>`select id::text, tenant_id::text as tenant from child_now where section = ${SECTION} and active order by roll_order(roll_no), roll_no limit 3`;
    const tenant = kids[0].tenant;
    RED = kids[2].id;
    const [ws] = await sql<{ id: string; item_ids: string[] }[]>`
      select t.id, t.item_ids from sheet_template t where t.source = 'library' and t.retired_at is null and t.band = 'G2' and cardinality(t.item_ids) >= 2 order by t.code limit 1`;
    const paper = (qr: string, child: string, daysAgo: number) => sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at, created_at)
      values (${tenant}, ${qr}, ${ws.id}, ${child}, ${SECTION}, date_trunc('week', now())::date, 'practice', 'printed', 'e2e',
              now() - make_interval(days => ${daysAgo}), now() - make_interval(days => ${daysAgo}), now())`;
    // one child's paper read three days ago with an answer still waiting, another's given five days ago and not back
    await paper(code("01"), kids[0].id, 3);
    await paper(code("02"), kids[1].id, 5);
    const read = await aReadPaper(sql, { qr: code("01"), child: kids[0].id, template: ws.id, items: ws.item_ids.slice(0, 2), reads: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }] });
    await sql`update capture set created_at = now() - interval '3 days' where id = ${read.capture}`;
    // a child red in two subjects: Maths's first skill and a subject of the run's own
    const [maths] = await sql<{ rung: string; skill: string }[]>`
      select ss.rung_code as rung, ss.registry_codes[1] as skill from skill ss where cardinality(ss.registry_codes) > 0 order by ss.ladder_order, ss.code limit 1`;
    await sql`insert into subject (tenant_id, code, name, label) values (${tenant}, ${SUBJECT}, 'Inventory subject', 'Inventory subject') on conflict do nothing`;
    await sql`insert into topic (tenant_id, code, subject_code, name, ord) values (${tenant}, 'U70ACRT', ${SUBJECT}, 'Inventory topic', 99) on conflict do nothing`;
    await sql`
      insert into skill (tenant_id, code, rung_code, name, learning_objective, difficulty, topic_code, grade, descriptor)
      values (${tenant}, 'U70ACR.SET', 'U70ACRR', 'An inventory skill', 'an inventory skill', '{}'::jsonb, 'U70ACRT', 'G2', 'an inventory skill') on conflict do nothing`;
    for (const [rung, skill] of [[maths.rung, maths.skill], ["U70ACRR", "U70ACR.SET"]])
      await sql`
        insert into child_skill_state (tenant_id, child_id, skill_code, rung_code, state, n_events, n_correct)
        values (${tenant}, ${RED}, ${skill}, ${rung}, 'emerging', 4, 0)
        on conflict (tenant_id, child_id, skill_code, rung_code) do update set state = 'emerging'`;
  });

export const acrossGone = (aside: Aside) =>
  aside(async (sql) => {
    await sql`update sheet_instance set print_status = 'void' where qr_code like ${`CS${RUN}%`}`;
    await sql`delete from child_skill_state where rung_code = 'U70ACRR'`;
    await sql`delete from skill where code = 'U70ACR.SET'`;
    await sql`delete from topic where code = 'U70ACRT'`;
    await sql`delete from subject where code = ${SUBJECT}`;
    // where each child stands is rebuilt from the evidence (ring B): the Maths state this run made goes with it
    if (RED) await sql`select rebuild_child_skill_state(${RED}::uuid)`;
  });
