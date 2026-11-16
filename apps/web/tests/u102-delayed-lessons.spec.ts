/**
 * U102 (CP-59, issue #792) — delayed lessons: the lessons of a class and week that went by without being taught, moved to free places of
 * a coming week in one save, and the week's ledger (what moved, what changed, what was not taught). One test for each Done-when line the
 * page can prove (specs/CP-59/spec.md; the engine's own are in packages/engine/tests/test_tt_delayed.py). The class is the spec's own
 * (a section of its own, grade G7, year 2089-90): last week it had Maths, English and Music each weekday at three periods, 25 minutes each, with
 * Monday's Maths taught; a fourth period, free every day, is where the delayed lessons go next week.
 */
import { expect, test, type Browser } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G7";
const HERE = "/timetable/delayed";
// a class of this run's own: the history of a move is kept for good, so a second run on the same database starts from a class with none
const SECTION = `T${String(Date.now()).slice(-7)}`;
let klass = "";
let tenant = "";
let lastMonday = "";
let nextMonday = "";
let wasOn = false;
let period: string[] = [];
const EDUCATOR = { email: "u102-educator@cornerstone.test", name: "Delayed Educator", role: "educator", classes: [], subjects: [] };
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const late = (page: import("@playwright/test").Page) => page.locator("[data-late]");
const where = async (id: string) => (await sql<{ day: string; ord: number }[]>`select d.on_date::text as day, p.ord from session s join school_day d on d.id = s.school_day_id join period p on p.id = s.period_id where s.id = ${id}`)[0];

test.beforeAll(async () => {
  const [{ t, campus, today }] = await sql<{ t: string; campus: string; today: string }[]>`
    select t.id as t, (select id from campus where tenant_id = t.id limit 1) as campus, (now() at time zone 'Asia/Kolkata')::date::text as today from tenant t order by t.created_at limit 1`;
  tenant = t;
  const wd = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  lastMonday = plus(plus(today, -wd), -7);
  nextMonday = plus(lastMonday, 14);
  const [{ id: year }] = await sql<{ id: string }[]>`
    insert into academic_year (tenant_id, label, starts_on, ends_on) values (${tenant}, '2089-90', '2026-01-01', '2090-03-31')
    on conflict (tenant_id, label) do update set label = excluded.label returning id`;
  klass = (await sql<{ id: string }[]>`
    insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${tenant}, ${campus}, ${year}, ${GRADE}, ${SECTION}, ${SECTION})
    on conflict (tenant_id, campus_id, academic_year_id, grade_code, section) do update set section = excluded.section returning id`)[0].id;
  period = [];
  for (const [i, starts] of ["21:13", "21:43", "22:13", "22:43"].entries()) {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${tenant}, ${GRADE}, ${10201 + i}, ${starts}::time, ${starts}::time + interval '25 minutes', ${`T102 p${i + 1}`}, false)
      on conflict (tenant_id, grade_code, starts_at) do update set ends_at = excluded.ends_at, label = excluded.label, ord = excluded.ord returning id`;
    period.push(p.id);
  }
  for (const [n, starts] of [[1, lastMonday], [2, plus(lastMonday, 14)]] as const)
    await sql`
      insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on) values (${tenant}, ${year}, ${Math.round(Date.parse(`${starts}T00:00:00Z`) / 86_400_000) + n}, 'teaching', ${starts}::date, ${plus(starts, 13)}::date)
      on conflict (tenant_id, academic_year_id, starts_on) do update set kind = 'teaching'`;
  // last week: three lessons a weekday; this week and next week: the same, so a coming week is "placed" and only the fourth period is free
  for (const monday of [lastMonday, plus(lastMonday, 7), nextMonday])
    for (let n = 0; n < 5; n++) {
      const [day] = await sql<{ id: string }[]>`
        insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, (select campus_id from school_class where id = ${klass}), ${plus(monday, n)}::date, 'teaching')
        on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
      for (const [i, subject] of ["math", "english", "music"].entries())
        await sql`
          insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
          values (${tenant}, ${klass}, ${day.id}, ${period[i]}, ${subject}, 'subject', ${monday === lastMonday && n === 0 && i === 0 ? "done" : "planned"}, true, ${`T102 ${subject} ${plus(monday, n)}`})`;
    }
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

test("2. the page lists the class's not-taught lessons of the week with a tick box each, and the free places of the coming week", async ({ page }) => {
  await page.goto(`${HERE}?class=${klass}&week=${lastMonday}&to=${nextMonday}`);
  // five days of three lessons, less Monday's Maths that was taught
  await expect(late(page)).toHaveCount(14);
  await expect(page.locator(`[data-late] input[type=checkbox]`).first()).not.toBeChecked();
  await expect(page.locator("[data-late]").first().locator("select option")).toHaveCount(6); // five free places (the fourth period each day) and "No place chosen"
  await expect(page.locator(`[data-late]`).filter({ hasText: "T102 math" })).toHaveCount(4); // Monday's was taught: not listed
  await expect(page.locator(`[data-late]`).first()).toContainText("T102 english");
});

test("4. saving with nothing ticked is refused and moves nothing", async ({ page }) => {
  await page.goto(`${HERE}?class=${klass}&week=${lastMonday}&to=${nextMonday}`);
  const before = (await sql<{ n: number }[]>`select count(*)::int as n from change_log where table_name = 'session' and op = 'move' and before ->> 'school_class_id' = ${klass}`)[0].n;
  await page.getByRole("button", { name: "Move the ticked lessons" }).click();
  await expect(page.locator(".tt-error")).toContainText("Tick at least one lesson");
  const after = (await sql<{ n: number }[]>`select count(*)::int as n from change_log where table_name = 'session' and op = 'move' and before ->> 'school_class_id' = ${klass}`)[0].n;
  expect(after).toBe(before);
});

test("3. ticking three not-taught lessons and choosing a week moves all three in one save, each shown as moved in the ledger", async ({ page }) => {
  await page.goto(`${HERE}?class=${klass}&week=${lastMonday}&to=${nextMonday}`);
  const rows = late(page);
  const ids = await Promise.all([0, 1, 2].map((i) => rows.nth(i).getAttribute("data-late")));
  for (const i of [0, 1, 2]) await rows.nth(i).locator("input[type=checkbox]").check();
  await page.getByLabel("Why (kept with each move)").fill("Sports week");
  await page.getByRole("button", { name: "Move the ticked lessons" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Done");
  // all three now sit on a fourth period of next week, on three different days
  const placed = await Promise.all(ids.map((id) => where(id!)));
  expect(placed.every((p) => p.ord === 10204 && p.day >= nextMonday && p.day <= plus(nextMonday, 6))).toBe(true);
  expect(new Set(placed.map((p) => p.day)).size).toBe(3);
  // the ledger of the week they left shows three moves, with the reason, and fewer not taught
  await expect(page.locator("[data-moved]")).toHaveCount(3);
  await expect(page.locator("[data-moved]").first()).toContainText("because Sports week");
  await expect(late(page)).toHaveCount(11);
  await expect(page.locator("[data-not-taught-count]")).toHaveAttribute("data-not-taught-count", "11");
});

test("5. the ledger of the week shows what changed: an edit of a lesson of the week, with who and why", async ({ page }) => {
  const [s] = await sql<{ id: string }[]>`select s.id::text as id from session s join school_day d on d.id = s.school_day_id where s.school_class_id = ${klass} and d.on_date = ${plus(lastMonday, 4)}::date limit 1`;
  await sql`
    insert into change_log (tenant_id, table_name, row_id, op, before, after, origin, reason)
    values (${tenant}, 'session', ${s.id}, 'edit', '{"text": "Fractions"}'::jsonb, '{"text": "Fractions, revisited"}'::jsonb, 'staff:test', 'U102 the class was slow')`;
  await page.goto(`${HERE}?class=${klass}&week=${lastMonday}&to=${nextMonday}`);
  await expect(page.locator("[data-changed]").first()).toContainText("from Fractions to Fractions, revisited");
  await expect(page.locator("[data-changed]").first()).toContainText("because U102 the class was slow");
});

const educator = async (browser: Browser) => {
  const c = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 1000 } });
  await c.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return c;
};

test("6. an educator moves her own class's delayed lessons, and can never move another class's", async ({ browser }) => {
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${tenant}, ps.staff_id, 'class_teacher', ${klass}, current_date - 400, 'u102 test' from pii.staff ps where ps.email = ${EDUCATOR.email}`;
  // another class of the same year, with a lesson that went by and was not taught, and no grant for this educator
  const [{ year, campus }] = await sql<{ year: string; campus: string }[]>`select academic_year_id as year, campus_id as campus from school_class where id = ${klass}`;
  const [other] = await sql<{ id: string }[]>`
    insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label) values (${tenant}, ${campus}, ${year}, ${GRADE}, ${`${SECTION}X`}, ${`${SECTION}X`}) returning id`;
  const [day] = await sql<{ id: string }[]>`select id from school_day where campus_id = ${campus} and on_date = ${lastMonday}::date`;
  const [theirs] = await sql<{ id: string }[]>`
    insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
    values (${tenant}, ${other.id}, ${day.id}, ${period[0]}, 'math', 'subject', 'planned', true, 'T102X math') returning id`;
  const c = await educator(browser);
  const page = await c.newPage();
  await page.goto(`${HERE}?class=${klass}&week=${lastMonday}&to=${nextMonday}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Delayed lessons");
  // her class only: no other class to choose from
  await expect(page.getByRole("combobox", { name: /Class/ }).locator("option")).toHaveCount(1);
  const one = late(page).first();
  const id = (await one.getAttribute("data-late"))!;
  await one.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: "Move the ticked lessons" }).click();
  await expect(page.locator("p[role=status]")).toContainText("Done");
  expect((await where(id)).ord).toBe(10204);
  // another class's lesson, asked for by hand: refused, and it stays where it was
  const res = await c.request.post("/api/timetable/delayed", {
    form: { class: other.id, back: `${HERE}?class=${other.id}`, lesson: theirs.id, [`to_${theirs.id}`]: `${nextMonday}~10204` },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(303);
  expect(res.headers().location).toContain("error=");
  expect(await where(theirs.id)).toEqual({ day: lastMonday, ord: 10201 });
  await c.close();
});
