/**
 * U79 (UI-6b) — the five timetable screens as their wireframes draw them (docs/frontend/wireframes/{timetable,fortnight,draft,moves,rules}.html):
 * what each adds beyond U74's behaviour. Stands on the U74 class and its two fortnights (tests/timetable-rows.ts).
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { AHEAD, HERE, timetableRows, type Fixture } from "./timetable-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let f: Fixture;
let wasOn = false;
test.beforeAll(async () => {
  f = await timetableRows(sql);
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

test("Timetable: a legend names Done, Moved by hand and Clash; the rail lists what changed this fortnight", async ({ page }) => {
  await page.goto(`/timetable?fn=${HERE}&class=${f.klass}`);
  const legend = page.locator("[data-legend]");
  await expect(legend).toContainText("Done");
  await expect(legend).toContainText("Moved by hand");
  await expect(legend).toContainText("Clash, not yet accepted");
  await expect(page.getByRole("region", { name: "Changed this fortnight" })).toBeVisible(); // a part of the rail, not a second side column (u13-frame: one aside, the rail)
});

test("Timetable: lessons by subject counts the class's sessions for the fortnight, subject by subject", async ({ page }) => {
  await page.goto(`/timetable?fn=${HERE}&class=${f.klass}`);
  const rows = await sql<{ code: string; n: number }[]>`
    select s.subject_code as code, count(*)::int as n from session s join school_day d on d.id = s.school_day_id join fortnight g on d.on_date between g.starts_on and g.ends_on
    where s.school_class_id = ${f.klass} and g.id = ${f.here} and s.kind <> 'fixed' and s.subject_code is not null group by 1`;
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) await expect(page.locator(`[data-subject-row="${r.code}"]`)).toContainText(String(r.n));
});

test("Fortnight: three cards (State, Plan lines, Hand moves) and every fortnight of the year by state", async ({ page }) => {
  await page.goto(`/timetable/fortnight/${HERE}`);
  const cards = page.locator("[data-block=Cards] article");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("State");
  await expect(cards.nth(1)).toContainText("Plan lines");
  await expect(cards.nth(2)).toContainText("Hand moves");
  const lanes = page.locator("[data-block=KanbanBoard] [data-lane]");
  await expect(lanes).toHaveText([/Drafted/, /Frozen/, /Aligned/, /Approved/, /List sent/]);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from fortnight where kind = 'teaching' and academic_year_id = (select academic_year_id from fortnight where id = ${f.here})`;
  await expect(page.locator("[data-block=KanbanBoard] [data-kcard]")).toHaveCount(n);
});

test("Fortnight: the rail lists the activities in the plan beside the grid and draft links", async ({ page }) => {
  await page.goto(`/timetable/fortnight/${HERE}`);
  await expect(page.locator("[data-rail]").getByRole("link", { name: "The grid" })).toBeVisible();
  await expect(page.locator("[data-rail]").getByRole("link", { name: "Draft from the rules" })).toBeVisible();
});

test("Draft: the fortnight is chosen from the teaching fortnights, and the rail says what the draft reads", async ({ page }) => {
  await page.goto(`/timetable/draft?fn=${AHEAD}`);
  const options = page.locator("select[name=fortnight] option");
  expect(await options.count()).toBeGreaterThan(0);
  await expect(page.locator("select[name=fortnight]")).toHaveValue(String(AHEAD));
  const reads = page.getByRole("complementary", { name: "What the draft reads" });
  const [{ blocks }] = await sql<{ blocks: number }[]>`select count(*)::int as blocks from timetable_rule where school_class_id = ${f.klass} and kind = 'block'`;
  await expect(reads).toContainText("Blocked days");
  await expect(reads.locator("dt", { hasText: "Blocked days" }).locator("xpath=following-sibling::dd[1]")).toHaveText(String(blocks));
});

test("Moves: a legend names the three marks, and the rail counts this draft so far", async ({ page }) => {
  await page.goto(`/timetable/moves?fn=${HERE}&class=${f.klass}`);
  const legend = page.locator("[data-legend]");
  await expect(legend).toContainText("Moved by hand");
  await expect(legend).toContainText("Clash, not yet accepted");
  await expect(legend).toContainText("Clash accepted");
  const so = page.getByRole("complementary", { name: "This draft so far" });
  const made = await page.locator("table tbody tr").count();
  await expect(so.locator("dt", { hasText: "Moved by hand" }).locator("xpath=following-sibling::dd[1]")).toHaveText(String(made));
});

test("Rules: each rule is a read-only row with Edit; Edit opens that row's fields with Save and Cancel, and Cancel closes it", async ({ page }) => {
  await page.goto(`/timetable/rules?class=${f.klass}`);
  const row = page.locator("[data-rule=period]").first();
  await expect(row.getByRole("link", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("form", { name: /^Edit period / })).toHaveCount(0); // read-only until Edit
  await row.getByRole("link", { name: "Edit" }).click();
  const form = page.getByRole("form", { name: /^Edit period / });
  await expect(form).toHaveCount(1);
  await expect(form.getByRole("button", { name: "Save" })).toBeVisible();
  await form.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByRole("form", { name: /^Edit period / })).toHaveCount(0);
});
