/**
 * U76 (UI-6b) — what the old "Your day" and "This week" pages did that the Timetable now does (issue #599, specs/UI-6b/spec.md): a
 * day that is not a date is not found; switched off, nothing is found; stepping a day or a week, over a weekend and across the
 * edge of a fortnight, onto a holiday. The old assertions of m1-09-calendar move here one for one, on the Timetable.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";
import { timetableRows, type Fixture } from "./timetable-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let f: Fixture;
let wasOn = false;
const EDUCATOR = { email: "u76-educator@cornerstone.test", name: "Timetable Educator Three", role: "educator", classes: [], subjects: ["NUM"] };

test.beforeAll(async () => {
  f = await timetableRows(sql);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  const [mine] = await sql<{ staff: string }[]>`select staff_id as staff from pii.staff where email = ${EDUCATOR.email}`;
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${f.tenant}, ${mine.staff}, 'cover_educator', ${f.klass}, current_date - 3, 'u76 test'
    where not exists (select 1 from staff_role_grant g where g.staff_id = ${mine.staff} and g.school_class_id = ${f.klass} and g.role_code = 'cover_educator')`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const day = (d: string, view = "day") => `/timetable?class=${f.klass}&view=${view}&day=${d}`;

test("a day in the address that is not a date is not found, never an error", async ({ page }) => {
  for (const href of [`/timetable?class=${f.klass}&day=foo`, `/timetable?class=${f.klass}&view=week&day=2026-13-45x`]) {
    await page.goto(href);
    await expect(page.getByText("This page could not be found.")).toBeVisible();
  }
});

// switched off, only the staff preview (a coordinator, while a class has lessons today) may look; an educator finds nothing
test("while the timetable is switched off the Timetable and a period are not found to an educator", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  const page = await context.newPage();
  await timetableSwitch(sql, false);
  try {
    for (const href of ["/timetable", `/timetable?class=${f.klass}&view=week`, "/period/00000000-0000-0000-0000-000000000000"]) {
      await page.goto(href);
      await expect(page.getByText("This page could not be found.")).toBeVisible();
    }
  } finally {
    await timetableSwitch(sql, true);
  }
});

test("Next day and Previous day step a school day, skip the weekend and cross the edge of a fortnight", async ({ page }) => {
  await page.goto(day(f.days[5])); // a Monday
  await page.getByRole("link", { name: "Previous day" }).click();
  await expect(page).toHaveURL(new RegExp(`day=${f.days[4]}`)); // the Friday before: the weekend is skipped
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(new RegExp(`day=${f.days[5]}`));
  // across the edge: the first day of the second fortnight, back to the last of the first, and on again
  await page.goto(day(f.days[10]));
  await expect(page.getByText("Fortnight 7402").first()).toBeVisible();
  await page.getByRole("link", { name: "Previous day" }).click();
  await expect(page).toHaveURL(new RegExp(`day=${f.days[9]}`));
  await expect(page.getByText("Fortnight 7401").first()).toBeVisible();
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(new RegExp(`day=${f.days[10]}`));
  await expect(page.getByText("Fortnight 7402").first()).toBeVisible();
});

test("Next week and Previous week step a week", async ({ page }) => {
  await page.goto(day(f.days[0], "week"));
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(5);
  await page.getByRole("link", { name: "Next week" }).click();
  await expect(page).toHaveURL(new RegExp(`day=${f.days[5]}`));
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(5);
  await page.getByRole("link", { name: "Previous week" }).click();
  await expect(page).toHaveURL(new RegExp(`day=${f.days[0]}`));
});

test("stepping onto a holiday says so in words", async ({ page }) => {
  const holiday = f.days[6];
  await sql`update school_day set kind = 'holiday', note = 'U76 holiday' where on_date = ${holiday}::date and tenant_id = ${f.tenant}`;
  try {
    await page.goto(day(f.days[5]));
    await page.getByRole("link", { name: "Next day" }).click();
    await expect(page).toHaveURL(new RegExp(`day=${holiday}`));
    await expect(page.locator("[data-holidays]")).toContainText("U76 holiday");
  } finally {
    await sql`update school_day set kind = 'teaching', note = null where on_date = ${holiday}::date and tenant_id = ${f.tenant}`;
  }
});
