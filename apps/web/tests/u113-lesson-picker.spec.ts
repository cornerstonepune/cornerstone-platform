/**
 * CP-74, the picker's page (issue #867; Nimish, 17 Nov 2026: "If I am choosing a point, the interactivity should be such that I should then be
 * choosing the activity or learning objective for that particular period, if I have to"). One test per behaviour, in the order a coordinator
 * meets them: a subject's order said right on Curriculum; a place in the Build grid before and after its fortnight is published; a lesson on
 * the Timetable page (choose, skip, clear, an activity); the Build tab; the phone gate at 400 px; and the whole subject once the order is
 * taken back. A year of its own (2037-38), two fortnights of its own, new classes each run; the objectives are Grade 1 Maths as seeded.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SHOTS = path.resolve(__dirname, "../../../docs/notes/img");
const RUN = randomBytes(3).toString("hex");
const START = "2037-07-06"; // a Monday
const PAST = "2020-01-06"; // a day gone by: the lesson that says where the class has reached
const ACT = `ACT-U113-${RUN}`;
let t: string;
let klass: string; // published in these tests
let waiting: string; // never published: its places have no lesson
let fortnight: number;
let los: { code: string; title: string }[]; // Grade 1 Maths, in teaching order

test.describe.configure({ mode: "serial" });

/** Grade 1 Maths' order as nobody has checked it: where these tests start, and how they leave it (a run cut short included). The list of
 *  approvals is only added to, so taking a yes back is one more row. */
const unchecked = () => sql`
  insert into approval (tenant_id, kind, target, decision, "by")
  select ${t}, 'objective_order', 'G1~NUM', 'withdrawn', 'u113 spec'
  where (select decision from approval where tenant_id = ${t} and kind = 'objective_order' and target = 'G1~NUM' order by seq desc limit 1) = 'approved'`;

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  [{ id: t }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select id from campus where tenant_id = ${t} limit 1`;
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${t}, '2037-38', '2037-06-01', '2038-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  [{ number: fortnight }] = await sql<{ number: number }[]>`
    insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on)
    values (${t}, ${year}, ${800000 + (parseInt(RUN, 16) % 90000)}, 'teaching', ${START}, '2037-07-17')
    on conflict (tenant_id, academic_year_id, starts_on) do update set kind = 'teaching' returning number`;
  const day = (on: string) =>
    sql<{ id: string }[]>`insert into school_day (tenant_id, campus_id, on_date, kind) values (${t}, ${campus}, ${on}, 'teaching')
      on conflict (tenant_id, campus_id, on_date) do update set kind = excluded.kind returning id`;
  for (let n = 0; n < 14; n++) {
    const d = new Date(`${START}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) await day(d.toISOString().slice(0, 10));
  }
  const [{ id: past }] = await day(PAST);
  const make = async (section: string) =>
    (await sql<{ id: string }[]>`
      insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${t}, ${campus}, ${year}, 'G1', ${section}, ${section})
      returning id`)[0].id;
  klass = await make(`P${RUN}`);
  waiting = await make(`W${RUN}`);
  const period = async (ord: number, at: string, label: string, fixed: boolean) =>
    (await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed)
      values (${t}, 'G1', ${ord}, ${at}, ${at}::time + interval '40 minutes', ${label}, ${fixed})
      on conflict (tenant_id, grade_code, starts_at, valid_from) do update set label = excluded.label, ord = excluded.ord, fixed = excluded.fixed returning id`)[0].id;
  const circle = await period(1, "08:30", "Assembly", true);
  const p1 = await period(2, "08:45", "P1", false);
  los = await sql<{ code: string; title: string }[]>`
    select code, title from learning_objective where tenant_id = ${t} and band = 'G1' and subject_code = 'NUM' and not retired order by ord nulls last, code limit 4`;
  for (const k of [klass, waiting]) {
    for (const wk of ["A", "B"])
      for (let wd = 1; wd <= 5; wd++) {
        await sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, text, valid_from)
          values (${t}, ${k}, 'frame', ${circle}, ${wk}, ${wd}, 'fixed', 'Assembly', '2026-01-01')`;
        await sql`insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from)
          values (${t}, ${k}, 'frame', ${p1}, ${wk}, ${wd}, 'subject', 'NUM', 'Maths', '2026-01-01')`;
      }
    // where each class has reached: its last Maths lesson, a day gone by, taught the first objective
    await sql`insert into session (tenant_id, school_class_id, school_day_id, period_id, kind, subject_code, text, lo_code)
      values (${t}, ${k}, ${past}, ${p1}, 'subject', 'NUM', 'Maths', ${los[0].code})`;
  }
  await unchecked();
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${t}, ${ACT}, 'G1', 'Maths', 'U113 bundles of ten', 'A') on conflict (tenant_id, code) do nothing`;
  await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (${t}, ${ACT}, ${los[2].code}, 1, 'school') on conflict do nothing`;
});
test.afterAll(async () => {
  await unchecked();
  await sql`delete from activity_objective where tenant_id = ${t} and activity_code = ${ACT}`;
  await sql.end();
});

const build = (k: string) => `/timetable/build?class=${k}&from=${START}`;
const week = (extra = "") => `/timetable?class=${klass}&fn=${fortnight}&view=week&day=${START}${extra}`;
const lessons = () =>
  sql<{ id: string; day: string; lo_code: string | null; activity_code: string | null; source: string }[]>`
    select s.id::text as id, d.on_date::text as day, s.lo_code, s.activity_code, s.source from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${klass} and s.kind = 'subject' and d.on_date >= ${START} order by d.on_date`;
const maths = (page: Page) => page.locator('[data-subject-row="NUM"]');
const openMaths = async (page: Page) => {
  await page.goto("/setup/curriculum?grade=G1&subject=NUM");
  await expect(maths(page).locator("[data-order-line]")).toBeVisible();
};

test("a coordinator says a subject's order is right on Curriculum, and the page then says who checked it and when", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMaths(page);
  const line = maths(page).locator("[data-order-line]");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(line).toContainText("Not checked yet, so a lesson is offered the whole subject.");
  // the units below are in the teaching order she is asked about: the first is the unit of the first objective
  await expect(maths(page).locator("[data-unit-row]").first()).toHaveAttribute("data-unit-row", "Numbers & Place Value");
  await line.locator("[data-order-right]").click();
  await expect(line).toHaveAttribute("data-order-checked", "");
  await expect(line).toContainText("Order checked by End-to-end test on");
  await expect(line.locator("[data-order-undo]")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "cp74-order-button-1440.png") });
  await page.setViewportSize({ width: 400, height: 800 });
  await page.reload();
  await expect(maths(page).locator("[data-order-line]")).toContainText("Order checked by");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await maths(page).locator("[data-order-line]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, "cp74-order-button-400.png") });
});

test("in Build, a place of a fortnight not yet published reads what is next up, and Publish offers suggestions", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(build(waiting));
  await page.locator("[data-cell]").first().click();
  const place = page.locator("[data-place-lesson]");
  await expect(place.locator("[data-place-title]")).toContainText("Monday P1, week A · Maths");
  await expect(place.locator("[data-place-next]")).toHaveText(los[1].title); // the objective after the one last taught
  await expect(place.locator("[data-place-how]")).toHaveText("Publish this fortnight to choose, or let the picker suggest for you.");
  await expect(place.locator("[data-picker-choose]")).toHaveCount(0); // read-only: nothing to choose with
  expect(new URL(page.url()).pathname).toBe("/timetable/build"); // no page change
  await page.screenshot({ path: path.join(SHOTS, "cp74-build-unpublished-1440.png") });
  await place.locator("[data-place-close]").click();
  await expect(page.getByRole("tab", { name: "Rules" })).toBeVisible(); // Check and Rules are back

  // the published class: Publish asks about suggestions, on by default; the new lessons get the next objectives, machine-made
  await page.goto(build(klass));
  await page.locator("[data-publish]").click();
  await expect(page.locator("[data-publish-suggest]")).toBeChecked();
  await expect(page.locator("[data-publish-sure]")).toContainText("Suggest objectives for subjects whose order is checked");
  await page.locator("[data-publish-yes]").click();
  await expect(page.locator("[data-said]")).toContainText("given a suggested objective");
  const made = await lessons();
  expect(made).toHaveLength(10);
  expect(made.slice(0, 3).map((l) => l.lo_code)).toEqual([los[1].code, los[2].code, los[3].code]);
  expect(new Set(made.map((l) => l.source))).toEqual(new Set(["machine"]));
});

test("in Build, a place of a published fortnight opens the picker for its dated lesson beside the grid, and a choice is the person's", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(build(klass));
  await page.locator("[data-cell]").first().click();
  const picker = page.locator("[data-place-lesson] [data-lesson-picker]");
  await expect(picker.locator("[data-picker-when]")).toContainText(`Monday, 6 Jul · Fortnight ${fortnight}`);
  await expect(picker.locator("[data-picker-now]")).toContainText(los[1].title); // the machine's suggestion, said so
  await expect(picker.locator("[data-picker-now]")).toContainText("suggested");
  await expect(page.locator("[data-cell][data-opened]")).toHaveCount(1); // the place open is marked in the grid
  await page.screenshot({ path: path.join(SHOTS, "cp74-build-published-1440.png") });
  await picker.locator('[data-tier="rest_of_unit"] > summary').click(); // the rest of the unit is one press away
  await picker.locator(`[data-tier="rest_of_unit"] [data-objective="${los[2].code}"]`).click();
  await picker.locator("[data-picker-choose]").click();
  await expect(picker.locator("[data-picker-said]")).toHaveText("Chosen.");
  expect(new URL(page.url()).pathname).toBe("/timetable/build");
  const [monday] = await lessons();
  expect(monday).toMatchObject({ day: START, lo_code: los[2].code, source: "person" });
  // Escape closes it and the place takes the focus back
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-place-lesson]")).toHaveCount(0);
  await expect(page.locator("[data-cell]").first()).toBeFocused();
});

test("on the Timetable, a lesson opens the picker in the panel: skip, clear, choose what is next in one press, then an activity", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const all = await lessons();
  const [tue, wed] = [all[1], all[2]];
  await page.goto(week());
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await page.locator(`[data-open-key="lesson:${wed.id}"]`).click();
  const picker = page.locator("#detail-panel [data-lesson-picker]");
  await expect(picker).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/timetable"); // the same page
  // the picker is the first thing in the panel, above its actions and tabs; a lesson that has an objective shows it in one line
  expect(await page.locator("#detail-panel").evaluate((box) => box.querySelector("[data-lesson-picker]")!.getBoundingClientRect().top < box.querySelector("[data-panel-actions]")!.getBoundingClientRect().top)).toBe(true);
  await expect(picker.locator("[data-picker-now]")).toContainText("suggested");
  await expect(picker.locator("[data-picker-choose]")).toHaveCount(0);
  await picker.locator("[data-picker-change]").click();
  await expect(picker.locator("[data-next-up]")).toHaveText("Next up");
  await expect(picker.locator("[data-picker-choose]")).toBeDisabled(); // nothing changed yet: the lesson holds its suggestion
  // skip: the panel closes and the lesson is as it was
  await picker.locator("[data-picker-skip]").click();
  await expect(page.locator("#detail-panel")).toHaveCount(0);
  expect((await lessons())[2]).toMatchObject({ lo_code: wed.lo_code, source: "machine" });
  // clear: a lesson with only its subject is whole, and the picker then opens on what is next, already selected
  await page.locator(`[data-open-key="lesson:${wed.id}"]`).click();
  await picker.locator("[data-picker-change]").click();
  await picker.locator("[data-picker-clear]").click();
  await expect(picker.locator("[data-picker-now]")).toContainText("Only its subject so far. Choosing is optional.");
  expect((await lessons())[2].lo_code).toBeNull();
  await expect(picker.locator("[data-next-up]").locator("xpath=ancestor::label//input")).toBeChecked();
  await expect(picker.locator("[data-picker-choose]")).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(picker.locator("[data-picker-choose]")).toBeInViewport(); // one press away, without scrolling
  await page.screenshot({ path: path.join(SHOTS, "cp74-picker-lesson-1440.png") });
  // one press chooses it, and the picker folds to the line that says what the lesson now teaches
  await picker.locator("[data-picker-choose]").click();
  await expect(picker.locator("[data-picker-said]")).toHaveText("Chosen.");
  await expect(picker.locator("[data-picker-now]")).not.toContainText("Only its subject");
  await expect(picker.locator("[data-picker-change]")).toBeVisible();
  const after = (await lessons())[2];
  expect(after.lo_code).not.toBeNull();
  expect(after.source).toBe("person");
  // an activity linked to the lesson's objective: one more press
  await page.goto(week(`&open=lesson:${tue.id}`));
  await expect(picker.locator("[data-picker-now]")).toContainText(los[2].title);
  await picker.locator("[data-picker-change]").click();
  await picker.locator(`[data-activity="${ACT}"]`).click();
  await picker.locator("[data-picker-choose]").click();
  await expect(picker.locator("[data-picker-said]")).toHaveText("Chosen.");
  expect((await lessons())[1]).toMatchObject({ lo_code: los[2].code, activity_code: ACT, source: "person" });
});

test("a coordinator's Timetable has a Build tab beside Day, Week and Fortnight, and Build's tabs lead back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(week());
  const tabs = page.getByRole("tablist", { name: "View" });
  await expect(tabs.getByRole("tab")).toHaveText(["Day", "Week", "Fortnight", "Time by subject", "Build"]);
  await page.screenshot({ path: path.join(SHOTS, "cp74-build-tab-1440.png") });
  await tabs.getByRole("tab", { name: "Build" }).click();
  await expect(page).toHaveURL(new RegExp(`/timetable/build\\?class=${klass}`));
  await expect(page.getByRole("tablist", { name: "View" }).getByRole("tab", { name: "Build" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await page.getByRole("tablist", { name: "View" }).getByRole("tab", { name: "Week" }).click();
  await expect(page).toHaveURL(/\/timetable\?view=week/);
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(week());
  await expect(page.getByRole("tablist", { name: "View" }).getByRole("tab", { name: "Build" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(SHOTS, "cp74-build-tab-400.png") });
  // Build itself is a desktop job: on a phone the place is read, never chosen for
  await page.goto(build(klass));
  await expect(page.locator("[data-cell]")).toHaveCount(0);
  await page.screenshot({ path: path.join(SHOTS, "cp74-build-published-400.png") });
});

test("at 400 px the picker passes the phone gate: one h1, no sideways scroll, controls of 44 px, the keyboard, the same order (Done when 8)", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  const thu = (await lessons())[3];
  await page.goto(week(`&open=lesson:${thu.id}`));
  const picker = page.locator("#detail-panel [data-lesson-picker]");
  await expect(picker).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await picker.locator("[data-picker-change]").click();
  // no sideways scroll of the page or of the sheet: nothing reaches past the right edge but what scrolls in a box of its own (the tabs)
  const wide = await page.evaluate(() => {
    const boxed = (el: Element | null): boolean => !!el && el !== document.body && (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(el).overflowX) || boxed(el.parentElement));
    return {
      page: document.documentElement.scrollWidth,
      past: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) => el.getClientRects().length > 0 && el.getBoundingClientRect().right > window.innerWidth + 1 && !boxed(el.parentElement))
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${Math.round(el.getBoundingClientRect().right)}`),
    };
  });
  expect(wide).toEqual({ page: 400, past: [] });
  // every control of the picker that is shown is at least 44 by 44
  const small = await picker.evaluate((box) =>
    Array.from(box.querySelectorAll<HTMLElement>("label.lp-row, button, summary, a, select"))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({ el: el.outerHTML.slice(0, 80), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }))
      .filter((r) => r.w < 44 || r.h < 44),
  );
  expect(small).toEqual([]);
  // the same order as on a desktop: what it teaches, the objectives, the activity, Choose, then planning more
  const order = await picker.evaluate((box) => ["[data-picker-now]", '[data-tier="next_up"]', "[data-picker-activities]", "[data-picker-choose]", "[data-picker-more]"].map((s) => box.querySelector(s)!.getBoundingClientRect().top));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  await page.screenshot({ path: path.join(SHOTS, "cp74-picker-lesson-400.png") });
  // the keyboard: an arrow moves the choice to the next objective, and Enter on Choose saves it
  const next = picker.locator('[data-tier="next_up"] input');
  await next.focus();
  await page.keyboard.press("ArrowDown");
  const chosen = await picker.locator(".lp-row[data-objective] input:checked").first().getAttribute("value");
  expect(chosen).not.toBe(await next.getAttribute("value"));
  await expect(picker.locator("[data-picker-activities]")).toHaveAttribute("data-picker-activities", chosen!);
  await picker.locator("[data-picker-choose]").focus();
  await page.keyboard.press("Enter");
  await expect(picker.locator("[data-picker-said]")).toHaveText("Chosen.");
  expect((await lessons())[3]).toMatchObject({ lo_code: chosen, source: "person" });
  await expect(picker).not.toContainText(/teacher/i);
});

test("once the order is taken back the picker shows the whole subject, says why, and marks nothing as next", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openMaths(page);
  await maths(page).locator("[data-order-undo]").click();
  await expect(maths(page).locator("[data-order-right]")).toBeVisible();
  const fri = (await lessons())[4];
  await page.goto(week(`&open=lesson:${fri.id}`));
  const picker = page.locator("#detail-panel [data-lesson-picker]");
  await picker.locator("[data-picker-change]").click();
  await expect(picker.locator("[data-order-unchecked]")).toContainText("The order of this subject is not checked yet, so the whole subject is shown");
  await expect(picker.locator("[data-order-unchecked]").getByRole("link", { name: "Check the order in Curriculum" })).toBeVisible();
  await expect(picker.locator("[data-next-up]")).toHaveCount(0);
  await expect(picker.locator('details[data-tier="all"]')).toHaveAttribute("open", "");
  await expect(picker.locator("[data-unit]").first()).toContainText("Numbers & Place Value");
  await page.screenshot({ path: path.join(SHOTS, "cp74-picker-whole-subject-1440.png") });
});
