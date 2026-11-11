/**
 * U75 (UI-6b) — what UI-6 left for the second part, one test per Done-when line of specs/UI-6b/spec.md that a browser can check
 * without the engine's Go live route (that part follows when the route is on main). The class "U74" is UI-6's own
 * (tests/timetable-rows.ts).
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";
import { GRADE, HERE, timetableRows, type Fixture } from "./timetable-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let f: Fixture;
let wasOn = false;
const EDUCATOR = { email: "u75b-educator@cornerstone.test", name: "Timetable Educator Two", role: "educator", classes: [], subjects: ["NUM"] };

test.beforeAll(async () => {
  f = await timetableRows(sql);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const TT = () => `/timetable?fn=${HERE}&class=${f.klass}`;

test("Timetable: at 400 px the Day view is the default, and a chosen view is kept", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(TT());
  await expect(page).toHaveURL(/view=day/);
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(1);
  await page.goto(`${TT()}&view=fortnight`);
  await expect(page).toHaveURL(/view=fortnight/);
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(10);
});

test("Timetable: at desktop width the Fortnight view is still the default", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(TT());
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(10);
  expect(page.url()).not.toMatch(/view=day/);
});

const educatorPage = async (browser: Browser): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};

test("Timetable: each day head opens that day, and Today opens today", async ({ page }) => {
  await page.goto(TT());
  const heads = page.locator("[data-block=FortnightGrid] a.b-dh");
  await expect(heads).toHaveCount(10);
  await heads.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`view=day.*day=${f.days[1]}|day=${f.days[1]}.*view=day`));
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(1);
  await page.goto(TT());
  const today = await page.locator("[data-today-link]").getAttribute("href");
  expect(today).toMatch(/view=day/);
  expect(today).toMatch(/day=\d{4}-\d{2}-\d{2}/);
});

test("Timetable: a cell opens the period of its session", async ({ page }) => {
  await page.goto(`${TT()}&view=day&day=${f.days[1]}`);
  const [row] = await sql<{ id: string }[]>`
    select s.id from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${f.klass} and d.on_date = ${f.days[1]}::date and s.period_id = ${f.periods[0].id}`;
  const hrefs = await page.locator("[data-block=FortnightGrid] a.b-cell").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs).toContain(`/period/${row.id}`);
});

test("Timetable: a period recorded done carries Done, one over and not recorded Late, and a period still to come none", async ({ page }) => {
  const set = (state: string, day: string, p: string) => sql`
    update session set state = ${state} where school_class_id = ${f.klass} and period_id = ${p}
      and school_day_id = (select id from school_day where on_date = ${day}::date and tenant_id = ${f.tenant} limit 1)`;
  const last = f.days[9];
  try {
    await set("done", f.days[0], f.periods[0].id);
    await set("not_done", f.days[0], f.periods[1].id);
    await page.goto(`${TT()}&view=day&day=${f.days[0]}`);
    const cells = page.locator("[data-block=FortnightGrid] a.b-cell");
    await expect(cells.nth(0)).toContainText(/done/i);
    await expect(cells.nth(1)).toContainText(/late/i);
    await expect(cells.nth(2)).not.toContainText(/done|late|do now/i);
    await page.goto(`${TT()}&view=day&day=${last}`);
    await expect(page.locator("[data-block=FortnightGrid] a.b-cell").first()).not.toContainText(/do now|done|late/i);
  } finally {
    await set("planned", f.days[0], f.periods[0].id);
    await set("planned", f.days[0], f.periods[1].id);
  }
});

test("Timetable: a holiday is named in words under the grid", async ({ page }) => {
  const day = f.days[2];
  await sql`update school_day set kind = 'holiday', note = 'U75 Diwali' where on_date = ${day}::date and tenant_id = ${f.tenant}`;
  try {
    await page.goto(TT());
    await expect(page.locator("[data-holidays]")).toContainText("U75 Diwali");
  } finally {
    await sql`update school_day set kind = 'teaching', note = null where on_date = ${day}::date and tenant_id = ${f.tenant}`;
  }
});

test("Timetable: an educator holding two classes has a class picker (the one-class educator has none: u74-timetable)", async ({ browser }) => {
  // made once and kept: a grant is never deleted, and a person cannot be granted the same place twice
  const [mine] = await sql<{ staff: string }[]>`select staff_id as staff from pii.staff where email = ${EDUCATOR.email}`;
  const [{ id: other }] = await sql<{ id: string }[]>`
    insert into school_class (tenant_id, campus_id, academic_year_id, grade_code, section, label)
    select c.tenant_id, c.campus_id, c.academic_year_id, ${GRADE}, 'U75B', 'U75B' from school_class c where c.id = ${f.klass}
    on conflict (tenant_id, campus_id, academic_year_id, grade_code, section) do update set label = excluded.label returning id`;
  for (const klass of [f.klass, other])
    await sql`
      insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
      select ${f.tenant}, ${mine.staff}, 'cover_educator', ${klass}, current_date - 3, 'u75 test'
      where not exists (select 1 from staff_role_grant g where g.staff_id = ${mine.staff} and g.school_class_id = ${klass} and g.role_code = 'cover_educator')`;
  const edu = await educatorPage(browser);
  await edu.goto(`/timetable?fn=${HERE}`);
  const picker = edu.getByLabel("Class");
  await expect(picker).toHaveCount(1);
  expect(await picker.locator("option").count()).toBe(2);
});
