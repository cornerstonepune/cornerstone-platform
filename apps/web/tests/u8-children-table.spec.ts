/**
 * U8 — the Children table (goals/u8-children-table.yaml).
 *
 * Nimish, 2026-09-30, over the Children page's dot cards: "We have a proper tabular view here that outlines children
 * with their grades or something like that, and then that is clickable". Each grade is a table of its children, one
 * row each with their standing and next step, sortable by any column, and a click anywhere on a row opens the child.
 *
 * The class is the test's own, three Grade 2 children, made once and kept (evidence is append-only):
 * - roll 1 has a red skill, an amber one and a green one, a paper read on 21 Sep, and a report written before their
 *   answers were signed off, so it is out of date;
 * - roll 2 has nothing yet;
 * - roll 10 has one secure skill and an approved report.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { TEST_STAFF } from "./global-setup";
import { aChildIn, daysAgo } from "./rows";
import { voiceSwitch } from "./k2-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U8-TEST";

type Answer = [skill: string, rung: string, right: boolean, mistakes: string[]];
const CHILDREN: { roll: string; name: string; answers: Answer[] }[] = [
  {
    roll: "1",
    name: "Asha",
    answers: [
      ...Array<Answer>(4).fill(["NUM.OPS.02", "R24", false, ["M_SMALL_FROM_LARGE"]]),
      ...Array<Answer>(2).fill(["NUM.OPS.02", "R24", true, []]),
      ...Array<Answer>(5).fill(["NUM.OPS.01", "R22", true, []]),
      ...Array<Answer>(3).fill(["NUM.OPS.01", "R22", false, []]),
      ...Array<Answer>(9).fill(["NUM.OPS.01", "R21", true, []]),
    ],
  },
  { roll: "2", name: "Bina", answers: [] },
  { roll: "10", name: "Chetan", answers: Array<Answer>(6).fill(["NUM.OPS.02", "R23", true, []]) },
];

async function testClass(): Promise<Record<string, string>> {
  const [{ tenant_id }] = await sql<{ tenant_id: string }[]>`select id as tenant_id from tenant limit 1`;
  const ids: Record<string, string> = {};
  for (const c of CHILDREN) {
    const [had] = await sql<{ id: string }[]>`select id from child_now where section = ${SECTION} and roll_no = ${c.roll}`;
    if (had) {
      ids[c.name] = had.id;
      continue;
    }
    const [{ id }] = [{ id: await aChildIn(sql, SECTION, "G2", c.roll) }];
    await sql`insert into pii.child (tenant_id, child_id, first_name) values (${tenant_id}, ${id}, ${c.name})`;
    // the reports before the answers they rest on: roll 1's, a draft, goes out of date; roll 10's is approved after
    if (c.roll === "1")
      await sql`insert into parent_note (tenant_id, child_id, week, body, created_at)
                values (${tenant_id}, ${id}, to_date('2091-W33', 'IYYY-"W"IW'), '{"facts": {}, "draft": {}}', now() - interval '2 days')`;
    const of = c.answers.map(([skill, rung]) => `${skill}|${rung}`);
    for (const [i, [skill, rung, right, mistakes]] of c.answers.entries()) {
      await sql`
        insert into evidence_event (tenant_id, child_id, skill_code, rung_code, correct, misconception_codes, channel,
                                    observed_at, confirmed_by)
        values (${tenant_id}, ${id}, ${skill}, ${rung}, ${right}, ${mistakes}, 'item',
                now() - make_interval(days => ${daysAgo(of, i)}), 'e2e')`;
    }
    await sql`select rebuild_child_skill_state(${id}::uuid)`;
    if (c.roll === "10")
      await sql`insert into parent_note (tenant_id, child_id, week, body, approved_by, created_at)
                values (${tenant_id}, ${id}, to_date('2091-W33', 'IYYY-"W"IW'), '{"facts": {}, "draft": {}}', 'e2e', now() + interval '1 minute')`;
    if (c.roll === "1") {
      const [{ id: tpl }] = await sql<{ id: string }[]>`
        insert into sheet_template (tenant_id, band, child_id, week) values (${tenant_id}, 'G2', ${id}, to_date('2091-W33', 'IYYY-"W"IW')) returning id`;
      const [{ id: inst }] = await sql<{ id: string }[]>`
        insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status)
        values (${tenant_id}, ${"U8-" + id.slice(0, 8)}, ${tpl}, ${id}, 'returned') returning id`;
      await sql`insert into capture (tenant_id, path, pages, sheet_instance_id, status, created_at)
                values (${tenant_id}, 'u8', 1, ${inst}, 'processed', '2026-09-21 10:00+05:30')`;
    }
    ids[c.name] = id;
  }
  return ids;
}

let ids: Record<string, string> = {};
test.beforeAll(async () => {
  ids = await testClass();
});
test.afterAll(async () => sql.end());

// UI-3b: the list of children is the Children screen (tests/u72-children.spec.ts holds its columns, bar, filters and sorting by Sr. No.).
// What this file kept from the old list: no code reaches an educator, and a name is read the one logged way.
test("each class is a table of its children in the school's words, and a name is read the one logged way", async ({ page }) => {
  await voiceSwitch(sql, true);
  const [{ n: before }] = await sql<{ n: number }[]>`
    select count(*)::int as n from access_log where child_id = ${ids.Asha} and actor = ${TEST_STAFF.email}`;
  const [{ id: classId }] = await sql<{ id: string }[]>`select class_id as id from child_now where id = ${ids.Asha}`;
  await page.goto(`/children?cls=${classId}`);
  const table = page.locator("[data-block=ChildrenGroups]"); // the groups, whatever they are
  await expect(table.getByRole("button", { name: /Asha/ })).toBeVisible();
  await expect(table.getByRole("button", { name: /Bina/ })).toBeVisible();
  await expect(table.getByRole("button", { name: /Chetan/ })).toBeVisible();
  // in the school's words: no rung, skill or mistake code reaches a teacher
  await expect(table).not.toContainText(/\b(R\d{1,2}|X[12]|M_[A-Z0-9_]+|[A-Z]{3}\.[A-Z0-9]+\.[A-Z0-9]+)\b/);
  // names are read the one logged way
  const [{ n: after }] = await sql<{ n: number }[]>`
    select count(*)::int as n from access_log where child_id = ${ids.Asha} and actor = ${TEST_STAFF.email}`;
  expect(after).toBeGreaterThan(before);
});
