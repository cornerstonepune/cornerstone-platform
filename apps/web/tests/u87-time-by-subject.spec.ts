/**
 * U87 (page charter B3) — Time by subject, a Dashboard: how much teaching time the class gives each subject, and whether it matches the
 * timetable rules. One test per line of the charter's B3 (and its place in the menu, A1). The class is the spec's own (section U87, grade
 * G8, in a year of its own, 2087-88, so no other class or fortnight is counted with it). Last week it had five Maths and five English
 * lessons and one Clay lesson, 25 minutes each; its rules give Maths and English every day and Music on Wednesday, Clay nothing. So Maths
 * and English are within their target, Music is short, and Clay has no target and no chip. The educator is named from tests/fake-names.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G8";
const EDUCATOR = { email: "u87-educator@cornerstone.test", name: FAKE_STAFF[1], role: "educator", classes: [], subjects: [] };
const HERE = "/timetable/time";
let klass = "";
let other = "";
let lastMonday = "";
let thisMonday = "";
let today = "";
let wasTimetable = false;

const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const as = async (browser: Browser, email: string): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const row = (page: Page, code: string) => page.locator(`[data-subject-time="${code}"]`);

test.beforeAll(async () => {
  const [{ tenant, campus, on }] = await sql<{ tenant: string; campus: string; on: string }[]>`
    select t.id as tenant, (select id from campus where tenant_id = t.id limit 1) as campus, (now() at time zone 'Asia/Kolkata')::date::text as on
    from tenant t order by t.created_at limit 1`;
  today = on;
  const wd = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  thisMonday = plus(today, -wd);
  lastMonday = plus(thisMonday, -7);
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, '2087-88', '2026-01-01', '2088-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  const aClass = async (section: string) =>
    (await sql<{ id: string }[]>`
      insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${tenant}, ${campus}, ${year}, ${GRADE}, ${section}, ${section})
      on conflict (tenant_id, campus_id, academic_year_id, grade_code, section) do update set section = excluded.section returning id`)[0].id;
  klass = await aClass("U87");
  other = await aClass("U87B");
  const period: Record<string, string> = {};
  for (const [name, starts, ord] of [["p1", "21:13", 8701], ["p2", "21:43", 8702], ["p3", "22:13", 8703]] as const) {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${tenant}, ${GRADE}, ${ord}, ${starts}::time, ${starts}::time + interval '25 minutes', ${`U87 ${name}`}, false)
      on conflict (tenant_id, grade_code, starts_at) do update set ends_at = excluded.ends_at, label = excluded.label returning id`;
    period[name] = p.id;
  }
  // the class's own teaching fortnight, from last Monday, in its own year
  const number = Math.round(Date.parse(`${lastMonday}T00:00:00Z`) / 86_400_000);
  await sql`
    insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on) values (${tenant}, ${year}, ${number}, 'teaching', ${lastMonday}::date, ${plus(lastMonday, 13)}::date)
    on conflict (tenant_id, academic_year_id, starts_on) do update set kind = 'teaching'`;
  for (const k of [klass, other]) {
    await sql`delete from timetable_rule where school_class_id = ${k} and kind = 'frame'`;
    await sql`delete from session where school_class_id = ${k}`;
  }
  for (const wk of ["A", "B"])
    for (let day = 1; day <= 5; day++)
      for (const [p, cell, subject] of [["p1", "subject", "math"], ["p2", "subject", "english"], ...(day === 3 ? [["p3", "specialist", "music"]] : [])] as const)
        await sql`
          insert into timetable_rule (tenant_id, school_class_id, kind, period_id, week_code, weekday, cell, subject_code, text, valid_from)
          values (${tenant}, ${klass}, 'frame', ${period[p]}, ${wk}, ${day}, ${cell}, ${subject}, ${`U87 ${subject}`}, '2026-01-01')`;
  for (let n = 0; n < 5; n++) {
    const [day] = await sql<{ id: string }[]>`
      insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${plus(lastMonday, n)}::date, 'teaching')
      on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
    const lessons: [string, string][] = [["p1", "math"], ["p2", "english"], ...(n === 0 ? ([["p3", "clay"]] as [string, string][]) : [])];
    for (const [p, subject] of lessons)
      await sql`
        insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
        values (${tenant}, ${klass}, ${day.id}, ${period[p]}, ${subject}, 'subject', 'planned', true, ${`U87 ${subject} lesson ${n + 1}`})`;
    // the second class: one Maths lesson a day, so "every class of the grade" is more than the one class
    await sql`
      insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
      values (${tenant}, ${other}, ${day.id}, ${period.p1}, 'math', 'subject', 'planned', true, ${`U87B math lesson ${n + 1}`})`;
  }
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${tenant}, ps.staff_id, 'cover_educator', ${klass}, current_date - 30, 'u87 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${klass})`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasTimetable = r.on;
});
test.afterAll(async () => {
  for (const k of [klass, other]) if (k) await sql`delete from session where school_class_id = ${k}`;
  await timetableSwitch(sql, wasTimetable);
  await sql.end();
});

test("A1. the menu lists Time by subject under Timetable, between the Fortnight and Materials, and it opens this page", async ({ page }) => {
  await page.goto(`${HERE}?class=${klass}`);
  const timetable = page.locator("[data-sidebar]").getByRole("list", { name: "Timetable" });
  await expect(timetable.getByRole("link")).toHaveText(["Week", "Fortnight", "Time by subject", "Materials"]);
  await expect(timetable.getByRole("link", { name: "Time by subject" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Time by subject");
});

test("B3 primary action. the range is Week, Fortnight, Month or Quarter: whole weeks ending today, carried in the address", async ({ page }) => {
  await page.goto(`${HERE}?class=${klass}`);
  const chooser = page.locator("[data-range-chooser] [role=tab]");
  await expect(chooser).toHaveText(["Week", "Fortnight", "Month", "Quarter"]);
  await expect(page.locator("[data-range-chooser] [aria-selected=true]")).toHaveText("Fortnight"); // the page opens on a fortnight
  await expect(page.locator("[data-chart=weeks] [data-week]")).toHaveCount(2);
  await expect(page.locator("[data-chart=weeks] [data-week]").first()).toHaveAttribute("data-week", lastMonday);
  for (const [range, weeks] of [["Week", 1], ["Month", 4], ["Quarter", 13]] as const) {
    await chooser.getByText(range, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`range=${range.toLowerCase()}`));
    await expect(page.locator("[data-chart=weeks] [data-week]")).toHaveCount(weeks);
    await expect(page.locator("[data-chart=weeks] [data-week]").last()).toHaveAttribute("data-week", thisMonday);
  }
});

test("B3 primary action. the class is one class, or every class of the grade for the coordinator", async ({ page }) => {
  await page.goto(`${HERE}?class=${klass}`);
  const choose = page.getByRole("combobox", { name: /Class/ });
  await expect(choose.locator("option")).toContainText(["All Grade 8", "U87", "U87B"].map((s) => new RegExp(s)));
  await expect(row(page, "math")).toContainText("125");
  await choose.selectOption(`all:${GRADE}`);
  await expect(page).toHaveURL(new RegExp(`class=all%3A${GRADE}`));
  await expect(row(page, "math")).toContainText("250"); // five lessons of each class
});

test("B3 primary action. an educator chooses only among the classes she holds, with no 'all'", async ({ browser }) => {
  await timetableSwitch(sql, true);
  const page = await as(browser, EDUCATOR.email);
  await page.goto(HERE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Time by subject");
  const options = page.getByRole("combobox", { name: /Class/ }).locator("option");
  await expect(options).toHaveCount(1);
  await expect(options).toContainText("U87");
  await expect(row(page, "math")).toContainText("125");
  await page.context().close();
});

test("B3. a stacked column per week in the subject colours, and a ring for the whole range", async ({ page }) => {
  await page.goto(`${HERE}?class=${klass}`);
  const week = page.locator(`[data-chart=weeks] [data-week="${lastMonday}"]`);
  await expect(week.locator("[data-segment]")).toHaveCount(3);
  // the school's own subject looks (config timetable.subject_looks): Maths numeracy, English language, a subject with none arts
  await expect(week.locator(`[data-segment="${lastMonday}~math"]`)).toHaveAttribute("data-subject", "numeracy");
  await expect(week.locator(`[data-segment="${lastMonday}~english"]`)).toHaveAttribute("data-subject", "language");
  await expect(week.locator(`[data-segment="${lastMonday}~clay"]`)).toHaveAttribute("data-subject", "arts");
  await expect(week.locator(`[data-segment="${lastMonday}~math"]`)).toHaveAttribute("aria-label", /125 min/);
  await expect(page.locator(`[data-chart=weeks] [data-week="${thisMonday}"] [data-segment]`)).toHaveCount(0);
  const ring = page.locator("[data-chart=donut]");
  await expect(ring.locator("[data-arc]")).toHaveCount(3);
  await expect(ring.locator("[data-arc=math]")).toHaveAttribute("data-subject", "numeracy");
  await expect(ring).toContainText("275");
});

test("B3. the table: subject, minutes, % of teaching time, the school's target and Within / Over / Short only where the rules give a target", async ({ page }) => {
  await page.goto(`${HERE}?class=${klass}`);
  const table = page.locator("[data-block=DataTable]");
  await expect(table.locator("thead th")).toHaveText(["Subject", "Minutes", "% of teaching time", "The school's target", "Against the target"]);
  await expect(row(page, "math").locator("td")).toHaveText(["Maths", "125", "45.5%", "45.5%", "Within"]);
  await expect(row(page, "english").locator("td")).toHaveText(["English", "125", "45.5%", "45.5%", "Within"]);
  await expect(row(page, "music").locator("td")).toHaveText(["Music", "0", "0%", "9.1%", "Short"]);
  await expect(row(page, "clay").locator("td")).toHaveText(["Clay", "25", "9.1%", "No target", "–"]);
  await expect(row(page, "clay").locator("[data-block=StatusChip]")).toHaveCount(0);
  await expect(row(page, "music").locator("[data-block=StatusChip]")).toHaveAttribute("data-tone", "wait");
});

test("B3. choosing a part of a week's column opens that week's lessons of that subject in the right panel", async ({ page }) => {
  await page.goto(`${HERE}?class=${klass}`);
  await expect(page.locator("[data-panel=summary]")).toBeVisible();
  await page.locator(`[data-segment="${lastMonday}~math"]`).click();
  await expect(page).toHaveURL(new RegExp(`open=period%3A${lastMonday}%7Emath`));
  const panel = page.locator("[data-block=DetailPanel]");
  await expect(panel.locator("[data-panel-title]")).toContainText("Maths, week of");
  const lessons = panel.locator("[data-week-lessons] [data-lesson]");
  await expect(lessons).toHaveCount(5);
  await expect(lessons.first()).toContainText("U87 math lesson 1");
  await expect(lessons.first().getByRole("link")).toHaveAttribute("href", /^\/period\/[0-9a-f-]{36}$/);
  await expect(panel).not.toContainText("English");
  await panel.locator("[data-panel-close]").click();
  await expect(page.locator("[data-panel=summary]")).toBeVisible();
});
