/**
 * U99 — Materials as the page charter's Part C draws it ("Materials": keep, reshape to Workspace: the list by day on the left, a line's
 * detail on the right). One test for each thing that line asks, and for the actions it keeps (a quantity, Remove, the coordinator's school
 * list) working from the new place. Stands on the K2 class's Fortnight 10 plan, as m1-09-materials and u74-materials do (the plan gives
 * Beads no quantity).
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { loadFortnight10, materialsFor, timetableSwitch } from "./educator-screens";
import { SECTION, k2Class } from "./k2-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const TUESDAY = "2026-12-01"; // Fortnight 10, week B: tulips today, the dustbin tomorrow, beads on Thursday
let klass = "";

test.beforeAll(async () => {
  ({ klass } = await k2Class(sql));
  loadFortnight10(SECTION);
  await materialsFor(sql);
  await timetableSwitch(sql, true);
});
// each test starts from the plan's lines and quantities (a line is never deleted: m1-09-materials.spec.ts)
test.beforeEach(async () => {
  await sql`
    update materials_line l set
      removed_at = case when l.source = 'educator' then coalesce(l.removed_at, now()) else null end,
      quantity = case when l.source = 'school' then (select sum((s ->> 'quantity')::numeric) from jsonb_array_elements(l.sources) s) else l.quantity end
    where l.list_id in (select id from materials_list where school_class_id = ${klass})`;
});
test.afterAll(async () => {
  await timetableSwitch(sql, false);
  await sql.end();
});

const HERE = () => `/timetable/materials?class=${klass}&day=${TUESDAY}&span=fortnight`;
const line = (page: Page, item: string) => page.locator("li[data-line]").filter({ hasText: item });
const panel = (page: Page) => page.locator("[data-block=DetailPanel][data-panel=open]");
const stat = (page: Page, id: string) => page.locator(`[data-panel=summary] [data-stat="${id}"] .b-stat-n`);

test("the lines are grouped by the day each is needed, on the left, and there is no rail", async ({ page }) => {
  await page.goto(HERE());
  await expect(page.locator("[data-rail]")).toHaveCount(0);
  const days = page.locator("#lines [data-day]");
  expect(await days.count()).toBeGreaterThan(1);
  // every line sits under its day's heading, and the days are the list's own
  for (const d of await days.all()) {
    await expect(d.locator("h3")).toHaveText((await d.getAttribute("data-day"))!);
    expect(await d.locator("li[data-line]").count()).toBeGreaterThan(0);
  }
  expect(await page.locator("li[data-line]").count()).toBe(await page.locator("#lines [data-day] li[data-line]").count());
  // the day the beads are needed (Thursday) is not the dustbin's (Wednesday)
  const dayOf = (item: string) => page.locator("#lines [data-day]").filter({ has: line(page, item) }).getAttribute("data-day");
  expect(await dayOf("Beads")).not.toBe(await dayOf("Dustbin"));
});

test("with nothing chosen the right side counts the days shown: lines, to confirm, days", async ({ page }) => {
  await page.goto(HERE());
  const lines = await page.locator("li[data-line]").count();
  await expect(stat(page, "lines")).toHaveText(String(lines));
  await expect(stat(page, "to confirm")).toHaveText(String(await page.locator('li[data-line] [data-chip="toConfirm"]').count()));
  await expect(stat(page, "days")).toHaveText(String(await page.locator("#lines [data-day]").count()));
  await expect(page.locator("[data-panel=summary]")).toContainText("Choose a line to see it here.");
});

test("choosing a line opens its detail on the right: how many, where it is kept, the activity that needs it; the address carries it", async ({ page }) => {
  await page.goto(HERE());
  const beads = line(page, "Beads");
  await expect(beads.locator('[data-chip="toConfirm"]')).toHaveCount(1); // the plan gives none: never guessed
  await beads.locator("[data-open-key]").click();
  await expect(page).toHaveURL(/open=line(:|%3A)[0-9a-f-]{36}/);
  await expect(beads.locator("[data-open-key]")).toHaveAttribute("aria-expanded", "true");
  const p = panel(page);
  await expect(p.locator("[data-panel-title]")).toHaveText("Beads");
  await expect(p.getByRole("tab")).toHaveText(["How many", "Activity"]);
  await expect(p.locator('input[name="quantity"]')).toHaveValue("");
  await expect(p.locator('[data-chip="toConfirm"]')).toHaveCount(1);
  await expect(p.locator("[data-home]")).toBeVisible();
  await p.getByRole("tab", { name: "Activity" }).click();
  await expect(p.locator("[data-line-activity]")).toHaveAttribute("href", /\/(setup\/activities|activity)\//);
  // a reload opens the same line on the same tab; the × closes it and the counts come back
  await page.reload();
  await expect(panel(page).getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
  await panel(page).locator("[data-panel-close]").click();
  await expect(page.locator("[data-panel=summary]")).toBeVisible();
});

test("the line's changes are made in its panel: a quantity saved clears 'to confirm', and Remove takes the line off the list", async ({ page }) => {
  await page.goto(HERE());
  await line(page, "Beads").locator("[data-open-key]").click();
  await panel(page).locator('input[name="quantity"]').fill("4");
  await panel(page).getByRole("button", { name: "Save" }).click();
  await expect(panel(page).locator('input[name="quantity"]')).toHaveValue("4");
  await expect(line(page, "Beads").locator('[data-chip="toConfirm"]')).toHaveCount(0);
  const kept = await sql<{ q: string }[]>`select l.quantity::text as q from materials_line l join materials_list m on m.id = l.list_id
    where m.school_class_id = ${klass} and l.material_code = 'MAT-M109-3' and l.removed_at is null`;
  expect(kept.map((r) => Number(r.q))).toContain(4); // kept by the engine, with who (the line edit), not only drawn
  await line(page, "Dustbin").locator("[data-open-key]").click();
  await expect(panel(page).locator("[data-panel-title]")).toHaveText("Dustbin");
  await expect(panel(page).locator('input[name="quantity"]')).toHaveValue("1"); // the new line's own quantity, never the last one typed
  await panel(page).getByRole("button", { name: /Remove/ }).click();
  await expect(line(page, "Dustbin")).toHaveCount(0);
  await expect(page.locator("[data-panel=summary]")).toBeVisible(); // the line is gone, so is its panel
});

test("Fill the quantities, the page's one main action, opens the first line still to confirm", async ({ page }) => {
  await page.goto(HERE());
  const first = page.locator('li[data-line]:has([data-chip="toConfirm"])').first();
  const item = (await first.locator("[data-open-key]").textContent())!.trim();
  await page.getByRole("link", { name: "Fill the quantities" }).click();
  await expect(panel(page).locator("[data-panel-title]")).toHaveText(item);
});

test("the coordinator's school list is a tab of the same page, and the old address opens this page", async ({ page }) => {
  await page.goto(HERE());
  const tabs = page.getByRole("navigation", { name: "View" });
  await tabs.getByRole("link", { name: "School list" }).click();
  await expect(page).toHaveURL(/tab=school/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Materials, this fortnight");
  await expect(page.getByRole("table", { name: "School list" }).locator("tbody tr").first()).toBeVisible();
  await expect(page.locator("[data-panel=summary]")).toBeVisible();
  await page.goto(`/educator/materials?class=${klass}&day=${TUESDAY}&span=week`);
  await expect(page).toHaveURL(new RegExp(`/timetable/materials\\?class=${klass}&day=${TUESDAY}&span=week$`));
  await expect(page.locator("li[data-line]").first()).toBeVisible();
});
