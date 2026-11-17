/**
 * CP-71, the Build page's panel (Done when 5, 6, 7 and 11 through the page; design E and wireframes 2 and 4): the checker's problems as
 * sentences with the fixes the engine proved, allowing one once, the rules as sentences that are added, edited and removed, one Undo for
 * cells and rules alike, and the panel folding by keyboard. Two classes of the test's own in a year of their own (so no other page counts
 * them), a made-up educator who holds Maths in both, made-up periods; new classes each run. No child, no real name.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SHOTS = path.resolve(__dirname, "../../../docs/notes/img");
const FROM = "2037-07-06"; // a Monday inside the test's own year
const RUN = randomBytes(3).toString("hex");
let one: string; // the class the page builds
let other: string; // the class the same educator also teaches
let url: string;

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  const [{ id: t }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${t} limit 1`;
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${t}, '2037-38', '2037-06-01', '2038-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  const klass = async (grade: string, section: string) =>
    (await sql<{ id: string }[]>`
      insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${t}, ${campus}, ${year}, ${grade}, ${section}, ${section})
      returning id`)[0].id;
  one = await klass("G1", `P${RUN}`);
  other = await klass("G4", `Q${RUN}`);
  const period = async (grade: string, ord: number, at: string, label: string, fixed: boolean) =>
    (await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed)
      values (${t}, ${grade}, ${ord}, ${at}, ${at}::time + interval '40 minutes', ${label}, ${fixed})
      on conflict (tenant_id, grade_code, starts_at, valid_from) do update set label = excluded.label, ord = excluded.ord, fixed = excluded.fixed returning id`)[0].id;
  const frame = (k: string, p: string, wk: string, wd: number, cell: string, code: string | null, text: string) =>
    sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from)
        values (${t}, ${k}, 'frame', ${p}, ${wk}, ${wd}, ${cell}, ${code}, ${text}, '2026-01-01')`;
  const circle = await period("G1", 1, "08:30", "Assembly", true);
  const p1 = await period("G1", 2, "08:45", "P1", false);
  const p2 = await period("G1", 3, "09:25", "P2", false);
  const q1 = await period("G4", 1, "08:50", "P1", false); // overlaps the other class's P1 on the clock
  for (const wk of ["A", "B"]) for (let wd = 1; wd <= 5; wd++) await frame(one, circle, wk, wd, "fixed", null, "Assembly");
  await frame(one, p1, "A", 1, "subject", "NUM", "Maths"); // Monday: the educator is with the other class too
  await frame(other, q1, "A", 1, "subject", "NUM", "Maths");
  await frame(one, p1, "A", 2, "subject", "NUM", "Maths"); // Tuesday: Maths twice
  await frame(one, p2, "A", 2, "subject", "NUM", "Maths");
  const [{ id: staff }] = await sql<{ id: string }[]>`insert into staff (tenant_id, campus_id) values (${t}, ${campus}) returning id`;
  await sql`insert into pii.staff (tenant_id, staff_id, name, email) values (${t}, ${staff}, 'Test Person', ${`u111-${RUN}@example.org`})`;
  for (const k of [one, other])
    await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, subject_code, valid_from, granted_by)
      values (${t}, ${staff}, 'subject_educator', ${k}, 'NUM', '2026-01-01', 'u111')`;
  url = `/timetable/build?class=${one}&from=${FROM}`;
});
test.afterAll(async () => {
  await sql.end();
});

const open = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await expect(page.locator("[data-build-panel]")).toBeVisible();
};
const problems = (page: Page, kind: string) => page.locator(`[data-check] [data-problem="${kind}"]`);
const said = (page: Page) => page.locator("[data-said]");

test("a clash is a sentence naming both classes with a proven way out; one click fixes it and Undo brings it back (Done when 5, 7)", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const clash = problems(page, "educator");
  await expect(clash).toHaveCount(1);
  await expect(clash).toContainText("One educator is down for");
  await expect(clash).toContainText(`P${RUN}`);
  await expect(clash).toContainText(`Q${RUN}`);
  await expect(clash).toContainText("Monday");
  await expect(clash).toContainText("must fix"); // the level is a word and an icon, not a colour alone
  await expect(page.getByRole("tab", { name: /Check \(1\)/ })).toHaveAttribute("aria-selected", "true");
  // the lesson in the grid says it too
  const monday = page.locator('[data-cell][data-day="1"]').first();
  await expect(monday).toHaveAttribute("data-problem", "must");
  await expect(monday).toHaveAttribute("aria-label", /has a problem to fix/);
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-check-1440.png"), fullPage: true });

  await clash.locator("[data-fix]").first().click();
  await expect(said(page)).toContainText("Undo puts it back");
  await expect(clash).toHaveCount(0);
  await expect(page.locator("[data-check]")).toContainText("All clear");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(clash).toHaveCount(1); // the fix was one ordinary change, undone like any other
});

test("rules are sentences: a day's most is added as a Try to, made a Must, edited, removed and undone, and the check follows each (Done when 6)", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "Rules" }).click();
  const rules = page.locator("[data-rules]");
  await expect(rules).toContainText("No counts yet");
  await expect(rules).toContainText("An educator teaches one class at a time. Always on.");
  await rules.locator("[data-add-rule]").click();
  await rules.locator('[data-add-open="day"]').click();
  await rules.locator('[data-add="day"] input[name="most"]').fill("1");
  await rules.locator("[data-add-save]").click();
  await expect(said(page)).toContainText("Rule added");
  const rule = rules.locator('[data-rule="limit"][data-span="day"]');
  await expect(rule).toHaveCount(1);
  await expect(rule).toContainText("of any one subject in a day");
  await expect(rule.locator("select")).toHaveValue("try"); // a day's rule is a Try to unless she says otherwise
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-rules-1440.png"), fullPage: true });

  await page.getByRole("tab", { name: /Check/ }).click();
  const day = problems(page, "most_in_day");
  await expect(day).toHaveCount(1);
  await expect(day).toContainText("Tuesday");
  await expect(day).toContainText("try to");
  await expect(day.locator("[data-allow]")).toHaveCount(0); // a Try to never blocks, so there is nothing to allow

  await page.getByRole("tab", { name: "Rules" }).click();
  await rule.locator("select").selectOption("must");
  await expect(said(page)).toContainText("Now a Must");
  await page.getByRole("tab", { name: /Check/ }).click();
  await expect(day).toContainText("must fix");

  await page.getByRole("tab", { name: "Rules" }).click();
  const most = rule.getByRole("spinbutton");
  await most.fill("2");
  await most.press("Enter"); // leaving the field saves it
  await expect(said(page)).toContainText("Rule changed");
  await page.getByRole("tab", { name: /Check/ }).click();
  await expect(day).toHaveCount(0);

  await page.getByRole("tab", { name: "Rules" }).click();
  await rule.locator("[data-remove]").click();
  await expect(rule).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click(); // a rule is undone like a cell
  await expect(rule).toHaveCount(1);
  await expect(rule.getByRole("spinbutton")).toHaveValue("2");
  await rule.locator("[data-remove]").click();
  await expect(rule).toHaveCount(0);
});

test("a subject's count for a week and an educator's day away are added from the same three sentences", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "Rules" }).click();
  const rules = page.locator("[data-rules]");
  await rules.locator("[data-add-rule]").click();
  await rules.locator('[data-add-open="count"]').click();
  await rules.locator('[data-add="count"] select[name="subject_code"]').selectOption("ENG"); // not placed yet: counts come before cells
  await rules.locator('[data-add="count"] input[name="most"]').fill("5");
  await rules.locator("[data-add-save]").click();
  const count = rules.locator('[data-rule="limit"][data-span="week"]');
  await expect(count).toHaveCount(1);
  await expect(count).toContainText("English");
  await expect(count.locator("select")).toHaveValue("must");

  await expect(rules.locator("[data-educator]")).toContainText("The Maths educator"); // never a name
  await rules.locator("[data-add-rule]").click();
  await rules.locator('[data-add-open="away"]').click();
  await rules.locator('[data-add="away"] select[name="weekday"]').selectOption("2");
  await rules.locator("[data-add-save]").click();
  const away = rules.locator('[data-rule="away"]');
  await expect(away).toContainText("Away on Tuesday, both weeks, all day");
  await page.getByRole("tab", { name: /Check/ }).click();
  await expect(problems(page, "away")).toHaveCount(2); // her two Tuesday lessons of week A
  await expect(problems(page, "away").first()).toContainText("is away on Tuesday");
  await page.getByRole("tab", { name: "Rules" }).click();
  await away.locator("[data-remove]").click();
  await count.locator("[data-remove]").click();
  await expect(rules.locator("[data-rule]")).toHaveCount(0);
});

test("the panel folds and unfolds by keyboard and still says how many problems are open (Done when 11)", async ({ page }) => {
  await open(page);
  const fold = page.locator("[data-fold]");
  const body = page.locator("#bd-side-body");
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await fold.focus();
  await page.keyboard.press("Enter");
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(body).toBeHidden();
  await expect(page.locator("[data-open-count]")).toHaveAttribute("data-open-count", "1");
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-folded-1440.png"), fullPage: true });
  await page.reload(); // her choice is remembered
  await expect(body).toBeHidden();
  await page.locator("[data-cell]").first().focus();
  await page.keyboard.press("["); // the key works from the grid
  await expect(body).toBeVisible();
  await expect(page.locator("[data-fold]")).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a Must problem is allowed once with a reason and then no longer counts", async ({ page }) => {
  await open(page);
  const clash = problems(page, "educator");
  await clash.getByText("Allow this once").click();
  await clash.getByLabel("Why it can stand").fill("The two classes are combined that morning");
  await clash.locator("[data-allow]").click();
  await expect(said(page)).toContainText("Allowed this once");
  await expect(clash).toContainText("allowed");
  await expect(clash.locator("[data-fix]")).toHaveCount(0);
  await expect(page.locator('[data-cell][data-day="1"]').first()).not.toHaveAttribute("data-problem", /.+/);
});
