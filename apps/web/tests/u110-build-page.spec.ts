/**
 * CP-71, Done when 11 (the Build page), part 1: the home and the week grid, read. Two classes of the test's own (a Grade 2 with a day and a
 * Grade 3 with none), made-up periods and subjects, no child, no real name. The page is read as the engine answers it; starting a class
 * from another writes through the engine, as a coordinator does.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SHOTS = path.resolve(__dirname, "../../../docs/notes/img");
const YEAR = "2039-40"; // the label has to look like a school year
let withDay: string;
let noDay: string;

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  const [{ id: t }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${t} limit 1`;
  // the newest year that holds today, so the home reads this one
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${t}, ${YEAR}, current_date - 1, current_date + 400)
    on conflict (tenant_id, label) do update set starts_on = current_date - 1, ends_on = current_date + 400 returning id`;
  const klass = async (grade: string, section: string) =>
    (await sql<{ id: string }[]>`
      insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${t}, ${campus}, ${year}, ${grade}, ${section}, ${section})
      on conflict (tenant_id, campus_id, academic_year_id, grade_code, section) do update set section = excluded.section returning id`)[0].id;
  withDay = await klass("G2", "T71a");
  noDay = await klass("G3", "T71b");
  await sql`delete from timetable_rule where school_class_id in ${sql([withDay, noDay])}`;
  await sql`delete from period where tenant_id = ${t} and grade_code in ('G2', 'G3')`;
  const period = async (ord: number, at: string, label: string, fixed: boolean) =>
    (await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed)
      values (${t}, 'G2', ${ord}, ${at}, ${at}::time + interval '40 minutes', ${label}, ${fixed}) returning id`)[0].id;
  // at most one Maths a day is a Try to (it has a weight); at most five a week is a Must
  await sql`insert into timetable_rule (tenant_id, school_class_id, kind, subject_code, span, most, weight) values (${t}, ${withDay}, 'limit', 'NUM', 'day', 1, 5)`;
  await sql`insert into timetable_rule (tenant_id, school_class_id, kind, subject_code, span, most) values (${t}, ${withDay}, 'limit', 'NUM', 'week', 5)`;
  const circle = await period(1, "08:30", "Assembly", true);
  const p1 = await period(2, "08:45", "P1", false);
  const p2 = await period(3, "09:25", "P2", false);
  for (const wk of ["A", "B"])
    for (let wd = 1; wd <= 5; wd++) {
      await sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, text, valid_from)
        values (${t}, ${withDay}, 'frame', ${circle}, ${wk}, ${wd}, 'fixed', 'Assembly', '2026-01-01')`;
      await sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from)
        values (${t}, ${withDay}, 'frame', ${p1}, ${wk}, ${wd}, 'subject', 'NUM', 'Maths', '2026-01-01')`;
      if (wk === "A")
        await sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from)
          values (${t}, ${withDay}, 'frame', ${p2}, ${wk}, ${wd}, 'subject', 'ENG', 'English', '2026-01-01')`;
    }
});
test.afterAll(async () => {
  await sql.end();
});

test("the Build home has one h1 and one main action, a card for each class, and a class with no day starts from the one that has", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/timetable/build");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator('[data-ux="action"]')).toHaveCount(1);
  await expect(page.locator("[data-class-card]")).toHaveCount(2);
  await expect(page.locator(`[data-class-card="${noDay}"]`)).toContainText("Not started");
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-home-1440.png"), fullPage: true });

  await page.locator(`[data-start="${noDay}"]`).click();
  await expect(page).toHaveURL(new RegExp(`class=${noDay}`));
  await expect(page.getByText("Assembly").first()).toBeVisible(); // the fixed row came across
  await expect(page.locator("[data-pattern-class]")).toHaveAttribute("data-pattern-class", noDay);
  await page.goto("/timetable/build");
  await expect(page.locator(`[data-class-card="${noDay}"]`)).not.toContainText("Not started");
});

test("the week grid reads week A and week B of a class, each cell its subject", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/timetable/build?class=${withDay}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const placed = page.locator("[data-cell]:not([data-empty])");
  await expect(placed).toHaveCount(10); // Maths and English, five days
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-grid-a-1440.png"), fullPage: true });
  await page.getByRole("button", { name: "Week B", exact: true }).click();
  await expect(placed).toHaveCount(5); // week B has no P2 lesson
  await expect(page.locator("[data-cell]", { hasText: "English" })).toHaveCount(0);
});

test("at 400 px the Build page has no sideways scroll and no paint controls", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  for (const url of ["/timetable/build", `/timetable/build?class=${withDay}`]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator("[data-paint]")).toHaveCount(0);
  }
  await page.goto(`/timetable/build?class=${withDay}`);
  await expect(page.locator('[data-block="FortnightGrid"] [data-subject]')).toHaveCount(10); // the phone reads the same pattern
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-grid-400.png"), fullPage: true });
});

const cellsOf = (page: import("@playwright/test").Page, word: string) => page.locator("[data-cell]", { hasText: word });

test("a coordinator paints a cell and undoes and redoes it, and the change is still there after a reload (Done when 2)", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/timetable/build?class=${withDay}`);
  await page.getByRole("button", { name: "Week B", exact: true }).click();
  await expect(cellsOf(page, "English")).toHaveCount(0);
  // the palette lists every subject of the grade from the school's list, each with its icon and word, not only the ones in use
  const chips = page.locator("[data-paint-subject]");
  expect(await chips.count()).toBeGreaterThan(4);
  await expect(chips.first().locator("svg")).toHaveCount(1);
  await page.locator('[data-paint-subject="ENG"]').click();
  await page.locator("[data-cell]").nth(5).click(); // week B, second period, Monday
  await expect(page.locator("[data-said]")).toContainText("English placed");
  await expect(cellsOf(page, "English")).toHaveCount(1);
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-paint-1440.png"), fullPage: true });
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cellsOf(page, "English")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(cellsOf(page, "English")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "Week B", exact: true }).click();
  await expect(cellsOf(page, "English")).toHaveCount(1); // written, not only drawn
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled(); // a fresh load has nothing to undo
  await page.locator('[data-paint-clear]').click();
  await page.locator("[data-cell]").nth(5).click();
  await expect(cellsOf(page, "English")).toHaveCount(0);
});

test("fill this period every day and copy week A to week B place the cells, undo puts them back, and the fixed row stays (Done when 3)", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/timetable/build?class=${withDay}`);
  await page.getByRole("button", { name: "Week B", exact: true }).click();
  await page.locator('[data-paint-subject="NUM"]').click();
  await page.locator("[data-fill]").nth(1).click(); // the second lesson period, both weeks
  await expect(page.locator("[data-said]")).toContainText("every day");
  await expect(cellsOf(page, "Maths")).toHaveCount(10); // week B's two periods, five days
  await page.getByRole("button", { name: "Copy week A to week B" }).click();
  await expect(page.locator("[data-said]")).toContainText("Week B now matches week A");
  await expect(cellsOf(page, "Maths")).toHaveCount(10); // week A's two periods are Maths too now
  await expect(page.locator(".b-band-body", { hasText: "Assembly" })).toBeVisible(); // the fixed row is untouched
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cellsOf(page, "Maths")).toHaveCount(5); // back to the one Maths row of the start
  await expect(page.locator(".b-band-body", { hasText: "Assembly" })).toBeVisible();
});

test("a problem is a sentence with a way out: a Try to and a Must show, a fix removes the Must, and undo puts the pattern back (Done when 6, 7)", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/timetable/build?class=${withDay}`);
  await page.getByRole("tab", { name: /Check/ }).click();
  await expect(page.locator("[data-all-clear]")).toContainText("All clear");
  await page.locator('[data-paint-subject="NUM"]').click();
  await page.locator("[data-cell]").nth(5).click(); // a second Maths on Monday, and a sixth in the week
  const must = page.locator('[data-problem][data-level="must"]');
  const soft = page.locator('[data-problem][data-level="try"]');
  await expect(must).toHaveCount(1);
  await expect(soft).toHaveCount(1);
  await expect(must).toContainText("Maths");
  await expect(must.locator("[data-fix]").first()).toBeVisible(); // a way out, worked out by the checker
  await expect(page.locator('[data-cell][data-problem="must"]').first()).toBeVisible(); // the cell says so too
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-check-1440.png"), fullPage: true });
  await must.locator("[data-fix]").first().click();
  await expect(must).toHaveCount(0); // applying the fix removed the Must and the checker found no new one
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-cell]:not([data-empty])")).toHaveCount(10); // back to the start
  await expect(page.locator("[data-all-clear]")).toBeVisible();
});

test("the rules panel says each rule in a sentence with Must or Try to, and folds and unfolds by keyboard (Done when 11)", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/timetable/build?class=${withDay}`);
  await page.getByRole("tab", { name: "Rules" }).click();
  await expect(page.getByText("Maths: at most 1 a day")).toContainText("Try to");
  await expect(page.getByText("Maths: at most 5 a week")).toContainText("Must");
  await page.getByText("Built in", { exact: true }).click();
  await expect(page.getByText("An educator teaches one class at a time")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-rules-1440.png"), fullPage: true });
  await page.locator("body").press("["); // fold
  await expect(page.locator("[data-folded]")).toBeVisible();
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await page.locator("[data-panel-toggle]").focus();
  await page.keyboard.press("Enter"); // unfold, by the keyboard alone
  await expect(page.getByRole("tablist")).toBeVisible();
});
