/**
 * U102 (CP-59, issue #792) — delayed lessons: the lessons of a class and week that went by without being taught, moved to free places of
 * a coming week in one save, and the week's ledger (what moved, what changed, what was not taught). One test for each Done-when line the
 * page can prove (specs/CP-59/spec.md; the engine's own are in packages/engine/tests/test_tt_delayed.py). The class is the spec's own
 * (a section of its own, grade G7, year 2089-90): last week it had Maths, English and Music each weekday at three periods, 25 minutes each, with
 * Monday's Maths taught; a fourth period, free every day, is where the delayed lessons go next week.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";

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
  const period: string[] = [];
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
