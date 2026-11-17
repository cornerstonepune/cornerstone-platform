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
  await expect(page.locator('[data-block="FortnightGrid"] [data-subject]')).toHaveCount(10); // Maths and English, five days
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-grid-a-1440.png"), fullPage: true });
  await page.getByRole("link", { name: "Week B" }).click();
  await expect(page.locator('[data-block="FortnightGrid"] [data-subject]')).toHaveCount(5); // week B has no P2 lesson
  await expect(page.getByText("English")).toHaveCount(0);
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
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-grid-400.png"), fullPage: true });
});
