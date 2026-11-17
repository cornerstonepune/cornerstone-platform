/**
 * U93 (page charter B3; CP-58, issue #791) — Time by subject: for each subject the minutes the timetable plans in a period and the minutes of
 * those lessons that were taught (state done), as a bar and a number, for a class, a grade or every class, over this week, month, quarter or
 * term or two chosen dates. One test per line of the spec (specs/CP-58/spec.md). The class is the spec's own (sections T93 and T93B, grade
 * G8, in a year of its own, 2087-88, so no other class or fortnight is counted with it). This week it has five Maths and five English
 * lessons and one Clay lesson, 25 minutes each, of which two Maths and one English lesson were taught; its rules give Maths and English
 * every day and Music on Wednesday, Clay nothing. So Maths and English are within their target, Music is short, and Clay has no target
 * and no chip. The educator is named from tests/fake-names.
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
const EDUCATOR = { email: "u93-educator@cornerstone.test", name: FAKE_STAFF[1], role: "educator", classes: [], subjects: [] };
const HERE = "/timetable?view=time";
let klass = "";
let other = "";
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
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, '2087-88', '2026-01-01', '2088-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  const aClass = async (section: string) =>
    (await sql<{ id: string }[]>`
      insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${tenant}, ${campus}, ${year}, ${GRADE}, ${section}, ${section})
      on conflict (tenant_id, campus_id, academic_year_id, grade_code, section) do update set section = excluded.section returning id`)[0].id;
  klass = await aClass("T93");
  other = await aClass("T93B");
  const period: Record<string, string> = {};
  for (const [name, starts, ord] of [["p1", "21:13", 9301], ["p2", "21:43", 9302], ["p3", "22:13", 9303]] as const) {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${tenant}, ${GRADE}, ${ord}, ${starts}::time, ${starts}::time + interval '25 minutes', ${`T93 ${name}`}, false)
      on conflict (tenant_id, grade_code, starts_at) do update set ends_at = excluded.ends_at, label = excluded.label returning id`;
    period[name] = p.id;
  }
  // the class's own teaching fortnight, from this Monday, in its own year
  const number = Math.round(Date.parse(`${thisMonday}T00:00:00Z`) / 86_400_000);
  await sql`
    insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on) values (${tenant}, ${year}, ${number}, 'teaching', ${thisMonday}::date, ${plus(thisMonday, 13)}::date)
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
          values (${tenant}, ${klass}, 'frame', ${period[p]}, ${wk}, ${day}, ${cell}, ${subject}, ${`T93 ${subject}`}, '2026-01-01')`;
  for (let n = 0; n < 5; n++) {
    const [day] = await sql<{ id: string }[]>`
      insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${plus(thisMonday, n)}::date, 'teaching')
      on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
    const lessons: [string, string][] = [["p1", "math"], ["p2", "english"], ...(n === 0 ? ([["p3", "clay"]] as [string, string][]) : [])];
    for (const [p, subject] of lessons)
      await sql`
        insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
        values (${tenant}, ${klass}, ${day.id}, ${period[p]}, ${subject}, 'subject', ${(subject === "math" && n < 2) || (subject === "english" && n === 0) ? "done" : "planned"}, true, ${`T93 ${subject} lesson ${n + 1}`})`;
    // the second class: one Maths lesson a day, so "every class of the grade" is more than the one class
    await sql`
      insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
      values (${tenant}, ${other}, ${day.id}, ${period.p1}, 'math', 'subject', 'planned', true, ${`T93B math lesson ${n + 1}`})`;
  }
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${tenant}, ps.staff_id, 'cover_educator', ${klass}, current_date - 30, 'u93 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${klass})`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasTimetable = r.on;
});
test.afterAll(async () => {
  for (const k of [klass, other]) if (k) await sql`delete from session where school_class_id = ${k}`;
  await timetableSwitch(sql, wasTimetable);
  await sql.end();
});

test("A1. the menu has one Timetable line, lit on this page (Time by subject is a view inside the Timetable)", async ({ page }) => {
  await page.goto(`${HERE}&scope=${klass}`);
  await expect(page.locator("[data-sidebar]").getByRole("link", { name: /^Timetable/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Timetable");
});

test("B3 primary action. the period is this week, month or quarter (and this term once the school names its terms), carried in the address, and each changes the dates and the figures", async ({ page }) => {
  await page.goto(`${HERE}&scope=${klass}`);
  const chooser = page.locator("[data-range-chooser] [role=tab]");
  await expect(chooser).toHaveText(["This week", "This month", "This quarter"]); // no term is named yet: none is invented
  await expect(page.locator("[data-range-chooser] [aria-selected=true]")).toHaveText("This week");
  await expect(page.locator(".tt-filters")).toHaveAttribute("data-from", thisMonday);
  await expect(page.locator(".tt-filters")).toHaveAttribute("data-to", plus(thisMonday, 6));
  await expect(row(page, "math")).toHaveAttribute("data-planned-minutes", "125");
  const [m, y] = [Number(today.slice(5, 7)), Number(today.slice(0, 4))];
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  await chooser.getByText("This month", { exact: true }).click();
  await expect(page).toHaveURL(/range=month/);
  await expect(page.locator(".tt-filters")).toHaveAttribute("data-from", monthStart);
  await expect(page.locator(".tt-filters")).toHaveAttribute("data-to", new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
  const q0 = Math.floor((m - 1) / 3) * 3;
  await chooser.getByText("This quarter", { exact: true }).click();
  await expect(page).toHaveURL(/range=quarter/);
  await expect(page.locator(".tt-filters")).toHaveAttribute("data-from", new Date(Date.UTC(y, q0, 1)).toISOString().slice(0, 10));
  await expect(page.locator(".tt-filters")).toHaveAttribute("data-to", new Date(Date.UTC(y, q0 + 3, 0)).toISOString().slice(0, 10));
  // the quarter holds the week, so the figures are at least the week's, and are the sum of the class's lessons in those dates
  const [{ planned }] = await sql<{ planned: number }[]>`
    select (count(*) * 25)::int as planned from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${klass} and s.kind <> 'fixed' and d.kind <> 'holiday'
      and d.on_date between ${new Date(Date.UTC(y, q0, 1)).toISOString().slice(0, 10)}::date and ${new Date(Date.UTC(y, q0 + 3, 0)).toISOString().slice(0, 10)}::date`;
  const shown = await page.locator("[data-subject-time]").evaluateAll((rs) => rs.reduce((t, r) => t + Number(r.getAttribute("data-planned-minutes")), 0));
  expect(shown).toBe(planned);
});

test("B3 primary action. This term appears when the school has named its terms, and shows the term's dates", async ({ page }) => {
  const terms = [{ label: "Term 2", starts_on: plus(thisMonday, -30), ends_on: plus(thisMonday, 60) }];
  await sql`
    insert into config (tenant_id, key, value, description) select id, 'school.terms', ${sql.json(terms)}, 'u93 test' from tenant order by created_at limit 1
    on conflict (tenant_id, key) do update set value = excluded.value`;
  try {
    await page.goto(`${HERE}&scope=${klass}`);
    await page.locator("[data-range-chooser]").getByText("This term", { exact: true }).click();
    await expect(page).toHaveURL(/range=term/);
    await expect(page.locator(".tt-filters")).toHaveAttribute("data-from", terms[0].starts_on);
    await expect(page.locator(".tt-filters")).toHaveAttribute("data-to", terms[0].ends_on);
    await expect(row(page, "math")).toHaveAttribute("data-planned-minutes", "125");
  } finally {
    await sql`update config set value = '[]'::jsonb where key = 'school.terms'`; // the school names none yet
  }
});

test("B3 primary action. two chosen dates make the period, and the figures are the sums of the lessons in them", async ({ page }) => {
  await page.goto(`${HERE}&scope=${klass}&from=${thisMonday}&to=${plus(thisMonday, 1)}`);
  await expect(page.locator(".tt-filters")).toHaveAttribute("data-from", thisMonday);
  await expect(page.locator(".tt-filters")).toHaveAttribute("data-to", plus(thisMonday, 1));
  // Monday and Tuesday: two Maths lessons (both taught), two English (one taught), one Clay: 50, 50 and 25 minutes planned
  await expect(row(page, "math")).toHaveAttribute("data-planned-minutes", "50");
  await expect(row(page, "math")).toHaveAttribute("data-taught-minutes", "50");
  await expect(row(page, "english")).toHaveAttribute("data-planned-minutes", "50");
  await expect(row(page, "english")).toHaveAttribute("data-taught-minutes", "25");
  await expect(row(page, "clay")).toHaveAttribute("data-taught-minutes", "0");
  // the form takes the dates
  await page.getByRole("form", { name: "Choose dates" }).getByLabel("To").fill(plus(thisMonday, 4));
  await page.getByRole("form", { name: "Choose dates" }).getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(new RegExp(`to=${plus(thisMonday, 4)}`));
  await expect(row(page, "math")).toHaveAttribute("data-planned-minutes", "125");
});

test("B3 primary action. the class is one class, a grade or every class, for the coordinator", async ({ page }) => {
  await page.goto(`${HERE}&scope=${klass}`);
  const choose = page.getByRole("combobox", { name: /Class/ });
  await expect(choose.locator("option")).toContainText(["All classes", "All Grade 8", "T93", "T93B"].map((s) => new RegExp(s)));
  await expect(row(page, "math")).toHaveAttribute("data-planned-minutes", "125");
  await choose.selectOption(`all:${GRADE}`);
  await expect(page).toHaveURL(new RegExp(`scope=all%3A${GRADE}`));
  await expect(row(page, "math")).toHaveAttribute("data-planned-minutes", "250"); // five lessons of each class
  await choose.selectOption("everyone");
  await expect(page).toHaveURL(/scope=everyone/);
  // every class with lessons this week: at least the two of this spec, so at least their Maths
  expect(Number(await row(page, "math").getAttribute("data-planned-minutes"))).toBeGreaterThanOrEqual(250);
});

test("B3 primary action. an educator chooses only among the classes she holds, with no 'all'", async ({ browser }) => {
  await timetableSwitch(sql, true);
  const page = await as(browser, EDUCATOR.email);
  await page.goto(HERE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Timetable");
  const options = page.getByRole("combobox", { name: /Class/ }).locator("option");
  await expect(options).toHaveCount(1);
  await expect(options).toContainText("T93");
  await expect(row(page, "math")).toHaveAttribute("data-planned-minutes", "125");
  await page.context().close();
});

test("B3. each subject has its planned minutes and its taught minutes, as a bar and a number", async ({ page }) => {
  await page.goto(`${HERE}&scope=${klass}`);
  const table = page.locator("[data-block=DataTable]");
  await expect(table.locator("thead th")).toHaveText(["Subject", "Planned in the timetable", "Taught", "Against the target"]);
  // the numbers say it in hours and minutes: 125 minutes is 2 h 5 min
  await expect(row(page, "math").locator("[data-bar=planned] b")).toHaveText("2 h 5 min");
  await expect(row(page, "math").locator("[data-bar=taught] b")).toHaveText("50 min");
  await expect(row(page, "english").locator("[data-bar=taught] b")).toHaveText("25 min");
  await expect(row(page, "music").locator("[data-bar=planned] b")).toHaveText("0 min");
  await expect(row(page, "clay").locator("[data-bar=planned] b")).toHaveText("25 min");
  await expect(row(page, "clay").locator("[data-bar=taught] b")).toHaveText("0 min");
  // the bars share one scale: Maths planned is the longest (full), its taught bar is 50 of 125 minutes
  const width = (sel: string) => row(page, "math").locator(sel).evaluate((el) => (el as HTMLElement).style.width);
  expect(await width("[data-bar=planned] i")).toBe("100%");
  expect(await width("[data-bar=taught] i")).toBe("40%");
  // the totals are the sums: 275 planned, 75 taught
  await expect(page.locator("[data-panel=summary]")).toContainText("275");
  await expect(page.locator("[data-panel=summary]")).toContainText("75");
  // the target and its chip stay, only where the rules give one
  await expect(row(page, "music").locator("[data-block=StatusChip]")).toHaveAttribute("data-tone", "wait");
  await expect(row(page, "clay").locator("[data-block=StatusChip]")).toHaveCount(0);
});

test("B3. choosing a subject opens its lessons of the period in the right panel, each with whether it was taught", async ({ page }) => {
  await page.goto(`${HERE}&scope=${klass}`);
  await expect(page.locator("[data-panel=summary]")).toBeVisible();
  await row(page, "math").locator("a[data-open-key]").click();
  await expect(page).toHaveURL(/open=period%3Amath/);
  const panel = page.locator("[data-block=DetailPanel]");
  await expect(panel.locator("[data-panel-title]")).toContainText("Maths, this week");
  const lessons = panel.locator("[data-week-lessons] [data-lesson]");
  await expect(lessons).toHaveCount(5);
  await expect(lessons.first()).toContainText("T93 math lesson 1");
  await expect(lessons.first()).toHaveAttribute("data-taught", "yes");
  await expect(lessons.nth(4)).toHaveAttribute("data-taught", "no");
  await expect(lessons.first().getByRole("link")).toHaveAttribute("href", /^\/period\/[0-9a-f-]{36}$/);
  await expect(panel).not.toContainText("English");
  await panel.locator("[data-panel-close]").click();
  await expect(page.locator("[data-panel=summary]")).toBeVisible();
});

test("the Materials page is out of the menu but stays: at its address and from a lesson's Materials tab", async ({ page }) => {
  const res = await page.goto("/timetable/materials");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Materials");
  const [{ id }] = await sql<{ id: string }[]>`
    select s.id::text as id from session s join school_day d on d.id = s.school_day_id where s.school_class_id = ${klass} and s.subject_code = 'math' order by d.on_date limit 1`;
  await page.goto(`/timetable?class=${klass}&view=week&open=lesson:${id}&tab=materials`);
  await expect(page.locator("[data-block=DetailPanel] [data-materials-link]")).toHaveAttribute("href", new RegExp(`^/timetable/materials\\?`));
});
