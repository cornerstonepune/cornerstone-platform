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

test("Fortnight: the page is the grid of the whole fortnight, its state steps are on it, and there are no cards, no plan-lines table and no board of fortnights", async ({ page }) => {
  await page.goto(`/timetable/fortnight/${HERE}?class=${f.klass}`);
  const grid = page.locator("[data-block=FortnightGrid]");
  await expect(grid.locator(".b-dh")).toHaveCount(10); // week A and week B
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from session s join school_day d on d.id = s.school_day_id join fortnight g on d.on_date between g.starts_on and g.ends_on
    where s.school_class_id = ${f.klass} and g.number = ${HERE} and s.kind <> 'fixed'`;
  await expect(grid.locator(".b-cell")).toHaveCount(n); // a block for every lesson
  await expect(page.locator("[data-block=Stepper] li")).toHaveText(["Drafted", "Frozen", "Aligned", "Approved", "List sent"]);
  await expect(page.locator("[data-block=Cards], [data-block=KanbanBoard], [data-card=plan]")).toHaveCount(0);
  await expect(page.getByTestId("stage").locator("[data-fortnight-state]")).toBeVisible();
});

test("Fortnight: the rail is the few places it connects to: the grid, Draft, Rules and Materials, not the activities", async ({ page }) => {
  await page.goto(`/timetable/fortnight/${HERE}`);
  await expect(page.locator("[data-rail]").getByRole("link", { name: "The grid" })).toBeVisible();
  await expect(page.locator("[data-rail]").getByRole("link", { name: "Draft from the rules" })).toBeVisible();
  for (const name of ["Timetable rules", "Materials"]) await expect(page.locator("[data-rail]").getByRole("link", { name })).toBeVisible();
  await expect(page.locator("[data-rail]").getByRole("link", { name: "Moves by hand" })).toHaveCount(0); // the moves are made on the grid itself
  expect(await page.locator("[data-rail] [data-rail-link]").count()).toBeLessThanOrEqual(6);
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

test("Fortnight, moving: a legend names the marks, and the moves made by hand are counted in their fold", async ({ page }) => {
  await page.goto(`/timetable/fortnight/${HERE}?class=${f.klass}`);
  const legend = page.locator("[data-legend]");
  await expect(legend).toContainText("Moved by hand");
  await expect(legend).toContainText("Clash, not yet accepted");
  const made = await page.locator("[data-hand-move]").count();
  expect(made).toBeGreaterThan(0);
  await expect(page.getByText(`Moved by hand (${made})`)).toBeVisible();
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
