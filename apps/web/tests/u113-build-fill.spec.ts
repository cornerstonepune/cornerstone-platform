/**
 * CP-75, Done when 5: the Build page's "Fill it in for me". The answer shows as a suggestion the coordinator uses or discards; nothing is
 * written until it is used, using it is one change that Undo reverses, and a timetable that cannot be met says which rule in words. A phone
 * reads and is offered no Fill. A class of the test's own in a year of its own, new each run; made-up periods and counts, no child, no name.
 * Nightly: not in the core.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SHOTS = path.resolve(__dirname, "../../../docs/notes/img");
const FROM = "2041-07-01"; // a Monday inside the test's own year
const RUN = randomBytes(3).toString("hex");
let klass: string;
let tenant: string;
let url: string;

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${tenant} limit 1`;
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, '2041-42', '2041-06-01', '2042-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  await sql`insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)
    select ${tenant}, ${year}, ${100000 + (parseInt(RUN, 16) % 800000)}, 'teaching', ${FROM}::date, ${FROM}::date + 13
    where not exists (select 1 from fortnight where academic_year_id = ${year})`;
  klass = (await sql<{ id: string }[]>`
    insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${tenant}, ${campus}, ${year}, 'G1', ${`F${RUN}`}, ${`F${RUN}`})
    returning id`)[0].id;
  // Grade 1's day as the other Build specs make it: a fixed assembly and two free periods, so ten places a week
  const period = async (ord: number, at: string, label: string, fixed: boolean) =>
    (await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed)
      values (${tenant}, 'G1', ${ord}, ${at}, ${at}::time + interval '40 minutes', ${label}, ${fixed})
      on conflict (tenant_id, grade_code, starts_at, valid_from) do update set label = excluded.label, ord = excluded.ord, fixed = excluded.fixed returning id`)[0].id;
  const circle = await period(1, "08:30", "Assembly", true);
  const p1 = await period(2, "08:45", "P1", false);
  await period(3, "09:25", "P2", false);
  for (const wk of ["A", "B"])
    for (let wd = 1; wd <= 5; wd++)
      await sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, text, valid_from)
        values (${tenant}, ${klass}, 'frame', ${circle}, ${wk}, ${wd}, 'fixed', 'Assembly', '2026-01-01')`;
  // one lesson a person placed: Maths, Monday P1 of week A
  await sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from, source)
    values (${tenant}, ${klass}, 'frame', ${p1}, 'A', 1, 'subject', 'NUM', 'Maths', '2026-01-01', 'person')`;
  for (const [subject, fewest] of [["NUM", 4], ["ENG", 3]] as const)
    await sql`insert into timetable_rule (tenant_id, school_class_id, kind, subject_code, span, fewest) values (${tenant}, ${klass}, 'limit', ${subject}, 'week', ${fewest})`;
  url = `/timetable/build?class=${klass}&from=${FROM}`;
});
test.afterAll(async () => {
  await sql.end();
});

/** The class's lessons as the database holds them from FROM: `week:weekday:subject:source`, sorted. */
const lessons = async () =>
  (
    await sql<{ k: string }[]>`
      select week_code || ':' || weekday || ':' || subject_code || ':' || source as k from timetable_rule
      where school_class_id = ${klass} and kind = 'frame' and cell = 'subject' and valid_from <= ${FROM} and (valid_to is null or valid_to >= ${FROM}) order by 1`
  ).map((r) => r.k);
const open = async (page: Page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url);
  await expect(page.locator("[data-fill-ask]")).toBeVisible();
};
const bar = (page: Page) => page.locator("[data-fill-bar]");
const placed = (page: Page) => page.locator("[data-cell]:not([data-empty])");

test("Fill it in for me shows a suggestion that is not saved; Discard leaves the timetable as it was", async ({ page }) => {
  await open(page);
  const before = await lessons();
  expect(before).toEqual(["A:1:NUM:person"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator('[data-ux="action"]')).toHaveCount(1); // Publish stays the page's one main action
  await page.locator("[data-fill-ask]").click();
  await expect(bar(page)).toHaveAttribute("data-fill-bar", "preview");
  await expect(bar(page)).toBeFocused();
  await expect(bar(page)).toContainText("Nothing is saved yet");
  await expect(bar(page)).toContainText("13 lessons placed"); // Maths 4 and English 3 a week, less the one already there
  await expect(bar(page)).toContainText("No specialist subjects are listed yet");
  await expect(placed(page)).toHaveCount(7); // week A as it would be
  await expect(page.locator("[data-cell][data-new]")).toHaveCount(6);
  await expect(page.locator("[data-paint-subject]").first()).toBeEnabled();
  await expect(page.locator("[data-copy-week]")).toBeDisabled(); // nothing else changes while a suggestion is up
  await expect(bar(page)).toHaveCSS("opacity", "1"); // the bar has arrived
  await page.screenshot({ path: path.join(SHOTS, "cp75-fill-preview-1440.png"), fullPage: true });
  expect(await lessons()).toEqual(before); // shown, not written
  await page.locator("[data-fill-discard]").click();
  await expect(bar(page)).toHaveCount(0);
  await expect(placed(page)).toHaveCount(1);
  expect(await lessons()).toEqual(before);
});

test("using the suggestion is one change, a person's lesson stays where it was, and one Undo puts everything back (Done when 5)", async ({ page }) => {
  await open(page);
  const before = await lessons();
  await page.locator("[data-fill-ask]").click();
  await page.locator("[data-fill-use]").click();
  await expect(page.locator("[data-said]")).toContainText("Filled in. Undo puts it back.");
  await expect(bar(page)).toHaveCount(0);
  await expect(placed(page)).toHaveCount(7);
  const after = await lessons();
  expect(after).toHaveLength(14);
  expect(after).toContain("A:1:NUM:person");
  expect(after.filter((k) => k.endsWith(":machine"))).toHaveLength(13);
  for (const wk of ["A", "B"]) {
    expect(after.filter((k) => k.startsWith(`${wk}:`) && k.includes(":NUM:"))).toHaveLength(4);
    expect(after.filter((k) => k.startsWith(`${wk}:`) && k.includes(":ENG:"))).toHaveLength(3);
  }
  await page.screenshot({ path: path.join(SHOTS, "cp75-fill-used-1440.png"), fullPage: true });
  await page.getByRole("button", { name: "Undo" }).click(); // one step, not thirteen
  await expect(page.locator("[data-said]")).toContainText("Undone");
  await expect(placed(page)).toHaveCount(1);
  expect(await lessons()).toEqual(before);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("a timetable that cannot be met says which rule, in words, and changes nothing", async ({ page }) => {
  await sql`insert into timetable_rule (tenant_id, school_class_id, kind, subject_code, span, fewest) values (${tenant}, ${klass}, 'limit', 'HIN', 'week', 11)`;
  try {
    await open(page);
    const before = await lessons();
    await page.locator("[data-fill-ask]").click();
    await expect(bar(page)).toHaveAttribute("data-fill-bar", "unmeetable");
    await expect(bar(page)).toContainText("cannot be filled in as the rules stand");
    await expect(bar(page)).toContainText("Hindi needs 11 in week A and there are 9 free places");
    await expect(bar(page).locator(".bd-fill-lines li")).toHaveCount(2); // the rule itself, once a week; not its consequences
    await expect(bar(page)).toHaveCSS("opacity", "1");
    await expect(page.locator("[data-fill-use]")).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, "cp75-fill-unmeetable-1440.png"), fullPage: true });
    await page.locator("[data-fill-close]").click();
    await expect(bar(page)).toHaveCount(0);
    expect(await lessons()).toEqual(before);
  } finally {
    await sql`delete from timetable_rule where school_class_id = ${klass} and kind = 'limit' and subject_code = 'HIN'`;
  }
});

test("at 400 px the page reads the pattern and offers no Fill", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.locator("[data-fill-ask]")).toHaveCount(0);
  await expect(page.locator("[data-paint]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(SHOTS, "cp75-fill-400.png"), fullPage: true });
});
