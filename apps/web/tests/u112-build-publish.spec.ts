/**
 * CP-71, the Build page's last part (Done when 8 and 11 through the page): Publish counts first and then writes one lesson for each lesson
 * of the pattern on each school day of the fortnight, none on a holiday; it is off, with its reason beside it, while a Must problem is
 * open; a change made on a pattern somebody else has since changed is refused in words; and at 400 px the page is a read-only view with
 * the problems and the rules as lists. A year of its own (2036-37), a fortnight of its own, new classes each run; made-up periods.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SHOTS = path.resolve(__dirname, "../../../docs/notes/img");
const RUN = randomBytes(3).toString("hex");
const START = "2036-07-07"; // a Monday
const HOLIDAY = "2036-07-10"; // the Thursday of week A
let t: string;
let ready: string; // a class with a pattern and no problem
let held: string; // a class whose weekly count is over
let fortnight: number;

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  [{ id: t }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${t} limit 1`;
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${t}, '2036-37', '2036-06-01', '2037-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  // one fortnight of its own that a second run finds again
  [{ number: fortnight }] = await sql<{ number: number }[]>`
    insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)
    values (${t}, ${year}, ${700000 + (parseInt(RUN, 16) % 90000)}, 'teaching', ${START}, '2036-07-18')
    on conflict (tenant_id, academic_year_id, starts_on) do update set kind = 'teaching' returning number`;
  for (let n = 0; n < 14; n++) {
    const d = new Date(`${START}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const on = d.toISOString().slice(0, 10);
    await sql`insert into school_day (tenant_id, campus_id, on_date, kind) values (${t}, ${campus}, ${on}, ${on === HOLIDAY ? "holiday" : "teaching"})
      on conflict (tenant_id, campus_id, on_date) do update set kind = excluded.kind`;
  }
  const klass = async (section: string) =>
    (await sql<{ id: string }[]>`
      insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${t}, ${campus}, ${year}, 'G1', ${section}, ${section})
      returning id`)[0].id;
  ready = await klass(`R${RUN}`);
  held = await klass(`S${RUN}`);
  const period = async (ord: number, at: string, label: string, fixed: boolean) =>
    (await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed)
      values (${t}, 'G1', ${ord}, ${at}, ${at}::time + interval '40 minutes', ${label}, ${fixed})
      on conflict (tenant_id, grade_code, starts_at, valid_from) do update set label = excluded.label, ord = excluded.ord, fixed = excluded.fixed returning id`)[0].id;
  const circle = await period(1, "08:30", "Assembly", true);
  const p1 = await period(2, "08:45", "P1", false);
  for (const k of [ready, held])
    for (const wk of ["A", "B"])
      for (let wd = 1; wd <= 5; wd++) {
        await sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, text, valid_from)
          values (${t}, ${k}, 'frame', ${circle}, ${wk}, ${wd}, 'fixed', 'Assembly', '2026-01-01')`;
        await sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from)
          values (${t}, ${k}, 'frame', ${p1}, ${wk}, ${wd}, 'subject', 'NUM', 'Maths', '2026-01-01')`;
      }
  // the held class: Maths at most 3 a week (a Must), five are placed
  await sql`insert into timetable_rule (tenant_id, school_class_id, kind, subject_code, span, most) values (${t}, ${held}, 'limit', 'NUM', 'week', 3)`;
});
test.afterAll(async () => {
  await sql.end();
});

const at = (k: string) => `/timetable/build?class=${k}&from=${START}`;

test("Publish counts first, then writes a lesson for each of the pattern's lessons on each school day, none on the holiday (Done when 8)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(at(ready));
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator('[data-ux="action"]')).toHaveCount(1); // one main action
  const go = page.locator("[data-publish]");
  await expect(go).toContainText(`Publish Fortnight ${fortnight}`);
  await expect(go).toBeEnabled();
  await go.click();
  const sure = page.locator("[data-publish-sure]");
  await expect(sure).toContainText("gets 18 lessons, none on 1 holiday"); // nine school days, Assembly and P1 on each
  await expect(page.locator('[data-ux="action"]')).toHaveCount(1);
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-publish-1440.png"), fullPage: true });
  const none = await sql`select count(*)::int as n from session s join school_day d on d.id = s.school_day_id where s.school_class_id = ${ready}`;
  expect(none[0].n).toBe(0); // counting wrote nothing
  await page.locator("[data-publish-yes]").click();
  await expect(page.locator("[data-published]")).toContainText("is published: 18 lessons");
  const days = await sql<{ on_date: string }[]>`select d.on_date::text as on_date from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${ready} and s.kind = 'subject' order by d.on_date`;
  expect(days).toHaveLength(9); // P1 on each school day
  expect(days.map((d) => d.on_date)).not.toContain(HOLIDAY);
  await page.reload();
  await expect(page.locator("[data-publish]")).toHaveCount(0); // this class has no unpublished fortnight left
  await expect(page.getByText("Every fortnight of this year is published.")).toBeVisible();
});

test("while a Must problem is open Publish is off and its reason is beside it (Done when 8)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(at(held));
  const go = page.locator("[data-publish]");
  await expect(go).toBeDisabled();
  await expect(page.locator("[data-publish-why]")).toContainText("2 to fix before publishing");
  await expect(go).toHaveAttribute("aria-describedby", "bd-publish-why");
  await expect(page.locator("[data-check]")).toContainText("Maths");
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-publish-blocked-1440.png"), fullPage: true });
 
  const none = await sql`select count(*)::int as n from session s where s.school_class_id = ${held}`;
  expect(none[0].n).toBe(0);
});

test("a change made on a pattern somebody else has since changed is refused in words and nothing is written", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(at(held));
  const before = await page.locator("[data-version]").first().getAttribute("data-version");
  // somebody else saves: a pattern cell of this class changes behind the page
  await sql`update timetable_rule set text = 'Maths ', updated_at = now()
    where school_class_id = ${held} and kind = 'frame' and cell = 'subject' and week_code = 'B' and weekday = 5`;
  await page.locator('[data-paint-subject="ENG"]').click();
  await page.locator("[data-cell]").nth(2).click();
  const said = page.locator("[data-said]");
  await expect(said).toContainText("changed since you opened");
  await expect(said.getByRole("button", { name: "Look again" })).toBeVisible();
  await said.getByRole("button", { name: "Look again" }).click();
  await expect(page.locator("[data-version]").first()).not.toHaveAttribute("data-version", before!);
  await expect(page.locator("[data-cell]", { hasText: "English" })).toHaveCount(0);
});

test("at 400 px the page is a read-only view: the grid, the problems and the rules as lists, no controls, no sideways scroll (Done when 11)", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(at(held));
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const control of ["[data-paint]", "[data-publish]", "[data-fold]", "[data-fill]", "[data-add-rule]"]) await expect(page.locator(control)).toHaveCount(0);
  const read = page.locator("[data-read-panel]");
  await expect(read).toContainText("Problems");
  await expect(read.locator("[data-problem]").first()).toContainText("Maths");
  await expect(read.locator("[data-read-rule]")).toContainText("Maths: at most 3 a week");
  await expect(read).toContainText("an educator teaches one class at a time");
  await page.screenshot({ path: path.join(SHOTS, "cp71-build-phone-400.png"), fullPage: true });
});
