/**
 * UI-3a — the Period screen (issue #518): a period opens for the educator, with an activity or without one. Split from the notes-loop
 * spec so these run in CI on their own (the file name matches a project's pattern: tests/../playwright.config.ts `steps`). Rows are the
 * test's own: the K2 class "M104" of tests/k2-rows.ts and one lesson of today, a fixed part of the day, with no activity.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { k2Class, noNotesWaiting, voiceSwitch } from "./k2-rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let klass: string;
let staff: string;
let lesson: string;

const TODAY = sql`(now() at time zone (select value #>> '{}' from config where key = 'school.time_zone'))::date`;

test.beforeAll(async () => {
  ({ klass, staff } = await k2Class(sql));
  // one lesson of today for the class, a fixed part of the day: no activity, so nothing to record
  const [{ id: t }] = await sql<{ id: string }[]>`select tenant_id as id from school_class where id = ${klass}`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select campus_id as id from school_class where id = ${klass}`;
  const [{ id: day }] = await sql<{ id: string }[]>`
    insert into school_day (tenant_id, campus_id, on_date, kind) select ${t}, ${campus}, ${TODAY}, 'teaching'
    on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
  const [{ id: period }] = await sql<{ id: string }[]>`
    insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${t}, 'K2', 90, '03:10', '03:40', 'UI-3a settling in', true)
    on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
  const [s] = await sql<{ id: string }[]>`
    insert into session (tenant_id, school_class_id, school_day_id, period_id, kind, text) values (${t}, ${klass}, ${day}, ${period}, 'fixed', 'Settling in')
    on conflict (school_class_id, school_day_id, period_id) do update set text = excluded.text returning id`;
  lesson = s.id;
});
test.afterAll(async () => {
  await voiceSwitch(sql, false);
  await timetableSwitch(sql, false);
  await sql.end();
});
test.beforeEach(async () => {
  await voiceSwitch(sql, true);
  await timetableSwitch(sql, true);
  await noNotesWaiting(sql, { klass, staff });
});

/** A lesson of today with an activity (a plan entry naming it), made once: its session, period and day. */
async function withActivity(): Promise<{ session: string; period: string; day: string }> {
  const [{ id: t }] = await sql<{ id: string }[]>`select tenant_id as id from school_class where id = ${klass}`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select campus_id as id from school_class where id = ${klass}`;
  const [{ id: year }] = await sql<{ id: string }[]>`select academic_year_id as id from school_class where id = ${klass}`;
  const [{ id: day }] = await sql<{ id: string }[]>`select id from school_day where tenant_id = ${t} and campus_id = ${campus} and on_date = ${TODAY}`;
  // the fortnight that holds today, if some other spec made one; else a day-long one of its own
  const [held] = await sql<{ id: string }[]>`select id from fortnight where tenant_id = ${t} and academic_year_id = ${year} and starts_on <= ${TODAY} and ends_on >= ${TODAY} limit 1`;
  const fortnight =
    held?.id ??
    (await sql<{ id: string }[]>`
      insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on, state) values (${t}, ${year}, 7390, 'teaching', ${TODAY}, ${TODAY}, 'planning') returning id`)[0].id;
  const [{ id: activity }] = await sql<{ id: string }[]>`select id from activity where code = 'ACT-K2-M104-904'`;
  const [{ id: entry }] = await sql<{ id: string }[]>`
    insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, source, activity_id, link_rule)
    values (${t}, ${klass}, ${fortnight}, 'UI-3A-1', 1, 'Sorting by colour', 'ui-3a', ${activity}, 'exact_name')
    on conflict (school_class_id, fortnight_id, plan_key, ord) do update set activity_id = excluded.activity_id returning id`;
  const [{ id: period }] = await sql<{ id: string }[]>`
    insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${t}, 'K2', 92, '03:42', '04:12', 'UI-3a with an activity', false)
    on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
  const [{ id: session }] = await sql<{ id: string }[]>`
    insert into session (tenant_id, school_class_id, school_day_id, period_id, kind, text, plan_entry_id) values (${t}, ${klass}, ${day}, ${period}, 'subject', 'Sorting', ${entry})
    on conflict (school_class_id, school_day_id, period_id) do update set plan_entry_id = excluded.plan_entry_id returning id`;
  return { session, period, day: (await sql<{ d: string }[]>`select ${TODAY}::text as d`)[0].d };
}

test("Period: a period that has an activity opens for the educator, with its actions, last time and steps", async ({ page }) => {
  const { session } = await withActivity();
  await page.goto(`/period/${session}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Placeholder sorting activity");
  await expect(page.getByRole("link", { name: "Record a note" })).toHaveAttribute("href", `/record?session=${session}`);
  await expect(page.getByRole("link", { name: "Type the marks instead" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the activity" })).toBeVisible();
  await expect(page.getByText("Not run with this class yet.")).toBeVisible();
  await expect(page.getByText("The steps, short")).toBeVisible();
});

test("Period: a period with no activity shows no capture controls and the words 'Nothing to record here'", async ({ page }) => {
  await page.goto(`/period/${lesson}`);
  await expect(page.getByRole("main")).toContainText("Nothing to record here");
  await expect(page.locator('a[href^="/record"]')).toHaveCount(0);
  await expect(page.locator("[data-block=CaptureBar], [data-rail-part=capture]")).toHaveCount(0);
});

test("Period: a period's address with its class and day opens its lesson", async ({ page }) => {
  const [row] = await sql<{ period: string; day: string }[]>`
    select s.period_id::text as period, d.on_date::text as day from session s join school_day d on d.id = s.school_day_id where s.id = ${lesson}`;
  await page.goto(`/period/${row.period}?class=${klass}&day=${row.day}`);
  await expect(page).toHaveURL(new RegExp(`/period/${lesson}$`));
  await expect(page.getByRole("main")).toContainText("Nothing to record here");
});

test("Period: a period with no lesson in it says so, read only, and opening it makes no lesson", async ({ page }) => {
  const [{ id: t }] = await sql<{ id: string }[]>`select tenant_id as id from school_class where id = ${klass}`;
  const [{ id: empty }] = await sql<{ id: string }[]>`
    insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${t}, 'K2', 93, '04:20', '04:50', 'UI-3a empty slot', false)
    on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
  const [{ day }] = await sql<{ day: string }[]>`select ${TODAY}::text as day`;
  const lessons = () => sql<{ n: number }[]>`select count(*)::int as n from session where school_class_id = ${klass}`;
  const before = (await lessons())[0].n;
  await page.goto(`/period/${empty}?class=${klass}&day=${day}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("No lesson here");
  await expect(page.locator('a[href^="/record"]')).toHaveCount(0);
  expect((await lessons())[0].n).toBe(before);
});

test("Period: with voice notes off it still opens, and offers no recording", async ({ page }) => {
  const { session } = await withActivity();
  await voiceSwitch(sql, false);
  await page.goto(`/period/${session}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Placeholder sorting activity");
  await expect(page.getByRole("link", { name: "Open the activity" })).toBeVisible();
  await expect(page.locator('a[href^="/record"]')).toHaveCount(0);
});

test("Period: the old address answers 308 to the new one, its class and day carried", async ({ page }) => {
  const [row] = await sql<{ period: string; day: string }[]>`
    select s.period_id::text as period, d.on_date::text as day from session s join school_day d on d.id = s.school_day_id where s.id = ${lesson}`;
  await page.goto(`/educator/period/${row.period}?class=${klass}&day=${row.day}`);
  await expect(page).toHaveURL(new RegExp(`/period/${lesson}$`));
});
