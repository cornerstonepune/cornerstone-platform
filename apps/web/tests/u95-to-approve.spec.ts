/**
 * U95 (CP-51, issue #762) — what the machine made sits in the curriculum from the start, tagged "To approve" until a person approves it,
 * and the tag is a filter on Curriculum and the Question bank; the lessons whose activity a person still has to settle are listed.
 *   1. Curriculum's Approval filter: "To approve" lists the machine's activity and not the sheet's; "Approved" the other way round.
 *   2. Approve on the activity's panel makes the machine's links the person's: it then reads "Approved".
 *   3. The Question bank carries the same filter, and "To approve" lists only questions no paper may draw yet.
 *   4. Curriculum's "Lessons to confirm" lists a lesson whose activity only the machine matched, as to approve, opening the lesson.
 *   5–6. CP-52 (#765): an activity the machine made reads to approve until approved; a routine line reads routine, not blank.
 * The rows are U94's (tests/u94-rows.ts), put back after; the lesson stands on the U74 class and fortnight (tests/timetable-rows.ts).
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { gate } from "./m1-13-rows";
import { timetableRows, type Fixture } from "./timetable-rows";
import { MACHINE, SHEET, u94Rows } from "./u94-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const LIST = 'table[aria-label="Activities and skills"]';
let f: Fixture;
let lesson = "";

test.beforeAll(async () => {
  await u94Rows(sql);
  f = await timetableRows(sql);
  const [s] = await sql<{ id: string }[]>`
    select s.id::text from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${f.klass} and d.on_date = ${f.days[1]}::date and s.period_id = ${f.periods[1].id}`;
  lesson = s.id;
  await sql`update plan_entry set activity_id = (select id from activity where code = ${MACHINE}), link_rule = 'model', link_run = gen_random_uuid() where school_class_id = ${f.klass} and fortnight_id = ${f.here} and plan_key = 'U74-1'`;
  await sql`update session set plan_entry_id = (select id from plan_entry where school_class_id = ${f.klass} and fortnight_id = ${f.here} and plan_key = 'U74-1'), activity_code = null where id = ${lesson}`;
});
test.beforeEach(async () => {
  await gate(sql, "open");
});
test.afterAll(async () => {
  await sql`update session set plan_entry_id = null where id = ${lesson}`;
  await sql`update plan_entry set activity_id = null, link_rule = null, link_run = null where school_class_id = ${f.klass} and fortnight_id = ${f.here} and plan_key = 'U74-1'`;
  await u94Rows(sql); // the machine's links back as the machine's
  await gate(sql, "closed");
  await sql.end();
});

test("1 · Curriculum's Approval filter: to approve is the machine's, approved the sheet's", async ({ page }) => {
  await page.goto("/setup/curriculum?q=U94&approval=toApprove");
  await expect(page.locator(`${LIST} tr[data-row="${MACHINE}"]`)).toBeVisible();
  await expect(page.locator(`${LIST} tr[data-row="${SHEET}"]`)).toHaveCount(0);
  await expect(page.locator(`${LIST} tr[data-row="${MACHINE}"]`)).toContainText("to approve");
  await page.goto("/setup/curriculum?q=U94&approval=approved");
  await expect(page.locator(`${LIST} tr[data-row="${SHEET}"]`)).toBeVisible();
  await expect(page.locator(`${LIST} tr[data-row="${MACHINE}"]`)).toHaveCount(0);
  await expect(page.locator('select[name="approval"] option')).toHaveText(["Approved or not", "To approve", "Approved"]);
});

test("2 · Approve on the panel makes the machine's links a person's, and the activity reads approved", async ({ page }) => {
  await page.goto(`/setup/curriculum?q=U94&open=activity:${MACHINE}`);
  await page.locator("[data-approve]").click();
  await expect(page.locator("[data-approve]")).toHaveCount(0); // nothing of it is the machine's now
  const left = await sql<{ n: number }[]>`
    select (select count(*) from activity_skill where activity_code = ${MACHINE} and source = 'machine')
         + (select count(*) from activity_objective where activity_code = ${MACHINE} and source = 'machine')::int as n`;
  expect(Number(left[0].n)).toBe(0);
  await page.goto("/setup/curriculum?q=U94&approval=approved");
  await expect(page.locator(`${LIST} tr[data-row="${MACHINE}"]`)).toBeVisible();
});

test("3 · The Question bank's Approval filter lists only questions no paper may draw yet", async ({ page }) => {
  await page.goto("/setup/question-bank?grade=all&approval=toApprove");
  await expect(page.locator('select[name="approval"]')).toHaveValue("toApprove");
  const keys = await page.locator('[data-open-key^="question:"]').evaluateAll((els) => els.map((e) => (e.getAttribute("data-open-key") ?? "").slice("question:".length)));
  if (keys.length) {
    const drawable = await sql<{ n: number }[]>`select count(*)::int as n from drawable_item where item_key = any(${keys as string[]})`;
    expect(drawable[0].n).toBe(0);
  }
});

test("4 · Lessons to confirm lists the lesson the machine matched, as to approve, opening the lesson", async ({ page }) => {
  // the list is of the grade the activity screens show (config curriculum.screens_grade); the U74 class's grade, for this test only
  const [was] = await sql<{ v: unknown }[]>`select value as v from config where key = 'curriculum.screens_grade'`;
  await sql`update config set value = to_jsonb((select grade_code from school_class where id = ${f.klass})) where key = 'curriculum.screens_grade'`;
  try {
    await lessonsListed(page);
  } finally {
    await sql`update config set value = ${sql.json(was.v as string)} where key = 'curriculum.screens_grade'`;
  }
});

async function lessonsListed(page: import("@playwright/test").Page) {
  await page.goto("/setup/curriculum?view=lessons");
  const row = page.locator(`tr[data-lesson-row="${lesson}"]`);
  // ten a page, the machine's first: it is on the first page
  await expect(row).toHaveAttribute("data-why", "machine");
  await expect(row).toContainText("to approve");
  await expect(row.locator("[data-lesson-link]")).toHaveAttribute("href", `/period/${lesson}`);
}

test("5 · CP-52: an activity the machine made for a planner line reads to approve before anything of it is drafted", async ({ page }) => {
  await sql`update activity set source_file = 'machine:plan_author' where code = ${SHEET}`;
  try {
    await page.goto("/setup/curriculum?q=U94&approval=toApprove");
    await expect(page.locator(`${LIST} tr[data-row="${SHEET}"]`)).toBeVisible();
    await page.goto(`/setup/curriculum?q=U94&open=activity:${SHEET}`);
    await page.locator("[data-approve]").click();
    await expect(page.locator("[data-approve]")).toHaveCount(0);
    const [a] = await sql<{ f: string }[]>`select source_file as f from activity where code = ${SHEET}`;
    expect(a.f).toBe("approved:machine:plan_author");
  } finally {
    await sql`update activity set source_file = '' where code = ${SHEET}`;
  }
});

test("6 · CP-52: a lesson whose planner line the machine called routine reads routine, not blank", async ({ page }) => {
  const [was] = await sql<{ v: unknown }[]>`select value as v from config where key = 'curriculum.screens_grade'`;
  await sql`update config set value = to_jsonb((select grade_code from school_class where id = ${f.klass})) where key = 'curriculum.screens_grade'`;
  const [pe] = await sql<{ id: string }[]>`select id::text from plan_entry where school_class_id = ${f.klass} and fortnight_id = ${f.here} and plan_key = 'U74-1'`;
  await sql`update plan_entry set activity_id = null, link_rule = null, link_run = null where id = ${pe.id}`;
  const [{ t }] = await sql<{ t: string }[]>`select tenant_id::text as t from plan_entry where id = ${pe.id}`;
  const [p] = await sql<{ id: string }[]>`
    insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, proposer, status, machine)
    values (${t}, gen_random_uuid(), 'plan_link', 'U95 routine', ${sql.json({ routine: true, activity: null, kind: "routine", plan_entries: [pe.id] })},
            'code', 'auto_passed', 'code:plan_author') returning id::text`;
  let done = false;
  try {
    // routine lessons are listed last: the last page (a page past the end is the last one)
    await page.goto("/setup/curriculum?view=lessons&lpage=99");
    const row = page.locator(`tr[data-lesson-row="${lesson}"]`);
    await expect(row).toHaveAttribute("data-why", "routine");
    await expect(row).toContainText("routine: no activity needed");
    await sql`insert into curriculum_proposal (tenant_id, about, run_id, kind, subject_code, status, reason, machine) values (${t}, ${p.id}, gen_random_uuid(), 'plan_link', 'U95 routine', 'reverted', 'test', 'test')`;
    await page.goto("/setup/curriculum?view=lessons"); // no longer routine: among the lines that matched nothing, before
    await expect(row).toHaveAttribute("data-why", "no_match");
    done = true;
  } finally {
    await sql`update config set value = ${sql.json(was.v as string)} where key = 'curriculum.screens_grade'`;
    // proposals are append-only: a verdict is withdrawn by a newer row about it (done above when the test got that far)
    if (!done) await sql`insert into curriculum_proposal (tenant_id, about, run_id, kind, subject_code, status, reason, machine) values (${t}, ${p.id}, gen_random_uuid(), 'plan_link', 'U95 routine', 'reverted', 'test', 'test')`;
  }
});
