/**
 * M1-09 — the K2 educator's Today and This week as calendars (goals/m1-09c-educator-calendar.yaml, D-075, D-076), on
 * Fortnight 10 as the school wrote it, loaded by M1-06's own loader into the tests' placeholder K2 class. Since UI-6b
 * (decision #599: no old screen stays active) the old "Your day" and "This week" pages are the Timetable's Day and Week
 * views; every old assertion now stands on them. Every period a block with its time and the school's words, coloured by
 * its state; every block opens its period. No child anywhere.
 *
 * Where each old test went:
 *  - a day that is not a date is not found → u76-timetable-steps.spec.ts (same assertions); switched off, an educator now reads a
 *    plain "No timetable is live yet" page, never "not found" (issue #691) → u76-timetable-steps.spec.ts and u80-timetable-all-fortnights.spec.ts
 *  - Today as a calendar → "the Day view" below; This week as a grid → "the Week view"; a block opens its period; the
 *    menu; today's column → below
 *  - not kept, by design: the sand/ivory/cream fill check (the look is now the rich one, docs/decisions/2026-11-09-the-look-rich.md;
 *    m1-09-tokens still holds every colour to the tokens), the "Free" word on an empty period (the wireframe draws a free
 *    period as a blank cell), the stacked days on a phone (the phone opens the Day view, one day at a time: u75 and u78).
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { loadFortnight10, tapsAreBig, timetableSwitch } from "./educator-screens";
import { SECTION, k2Class } from "./k2-rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const MONDAY = "2026-11-23"; // Fortnight 10, week A; Tuesday 24 is a holiday
const HOLIDAY = "2026-11-24";
let klass = "";

test.beforeAll(async () => {
  ({ klass } = await k2Class(sql));
  loadFortnight10(SECTION);
  // the school's calendar names Tuesday 24 a holiday (Guru Nanak Jayanti); the loader does not overwrite a day another run changed, so state it
  await sql`update school_day set kind = 'holiday', note = 'Guru Nanak Jayanti' where on_date = ${HOLIDAY}::date and campus_id = (select campus_id from school_class where id = ${klass})`;
});
test.afterAll(async () => {
  await timetableSwitch(sql, false);
  await sql.end();
});

const GRID = "[data-block=FortnightGrid]";
const at = (view: string, day = MONDAY) => `/timetable?class=${klass}&view=${view}&day=${day}`;
const white = (page: Page) => page.locator("body").evaluate((e) => getComputedStyle(e).backgroundColor);

test("the Day view is the day as a calendar: every period in time order, its time as a range, the school's words, a chip only on work", async ({ page }) => {
  await timetableSwitch(sql, true);
  await page.goto(at("day"));
  expect(await white(page)).not.toBe("rgba(0, 0, 0, 0)");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Timetable");
  await expect(page.locator(`${GRID} .b-dh`)).toHaveText(["Mon 23"]);
  // fifteen periods in the day: the lessons are cells, the fixed parts of the day are bands across it
  const cells = page.locator(`${GRID} a.b-cell`);
  const bands = page.locator(`${GRID} .b-band`);
  expect((await cells.count()) + (await bands.count())).toBe(15);
  await expect(bands.first()).toContainText("08:30"); // its time, as time
  await expect(bands.first()).toContainText("Settling + Outdoor free play"); // the school's words
  const times = await page.locator(`${GRID} .b-tm`).allTextContents();
  expect(times[0]).toMatch(/^\d\d:\d\d–\d\d:\d\d/); // a range, start to end
  expect([...times].sort()).toEqual(times); // in time order
  await expect(page.locator(`${GRID} .b-band [data-block=StatusChip]`)).toHaveCount(0); // none on a fixed part of the day
  // no chip but Do now on any cell (D-075: a future cell has none, and nothing is recorded); Do now only while it runs
  await expect(page.locator(`${GRID} [data-block=StatusChip]:not([data-status=doNow])`)).toHaveCount(0);
  await expect(page.locator("[data-summary]")).toContainText(`${await cells.count()} lessons`);
  await expect(page.locator(`${GRID} .b-cell`).filter({ hasText: "general_awareness" })).toHaveCount(0); // never a raw code
  const ahead = MONDAY > (await page.evaluate(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })));
  await expect(page.locator("[data-next]")).toContainText(ahead ? "09:40" : "This day is over."); // on and after the day itself, the aside says so
  const legend = page.locator("[data-legend]"); // what the colours mean
  for (const word of ["Done", "Do now", "Late"]) await expect(legend).toContainText(word);
  await expect(page.locator(`${GRID} [aria-current=time]`)).toHaveCount(0); // not today: no Now line
  await tapsAreBig(page);
});

test("the Week view is a grid: a column a day, a row a period, a holiday named; one row, one time", async ({ page }) => {
  await timetableSwitch(sql, true);
  await page.goto(at("week"));
  await expect(page.locator(`${GRID} .b-dh`)).toHaveCount(5);
  await expect(page.locator("[data-holidays]")).toContainText("Holiday"); // Tuesday 24, in words
  await expect(page.locator("[data-summary]")).toContainText("1 holiday");
  const first = page.locator(`${GRID} a.b-cell`).first();
  await expect(first).toBeVisible();
  // one row, one time: the lessons of one row share their top edge across the days
  const row = page.locator(`${GRID} .b-tm`).filter({ hasText: /^09:40/ }).first();
  const rowY = Math.round((await row.boundingBox())!.y);
  const sameRow = await page.locator(`${GRID} a.b-cell`).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().y)));
  expect(sameRow.filter((y) => Math.abs(y - rowY) < 40).length).toBeGreaterThan(1);
  await tapsAreBig(page);
});

// The title is the goal's proof by name (goals/m1-09c-educator-calendar.yaml), so it stays. What it proves now: a block's own link opens the
// lesson page (the activity in full, in the school's words), where it once opened a period page; the coordinator's click on the block
// itself chooses it to move, on the fortnight page.
test("any block opens its period: the school's words and the activity", async ({ page }) => {
  await timetableSwitch(sql, true);
  await page.goto(at("day"));
  const block = page.locator(`${GRID} .b-cell-w`).filter({ hasText: "General Awareness" });
  await block.locator("[data-activity-link]").click();
  await expect(page).toHaveURL(/\/period\//); // the lesson's own page, not the curriculum editor
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Insects"); // the page is named by its activity
  await expect(page.getByText("Insects").first()).toBeVisible(); // the activity the planner names for the lesson
});

test("her menu marks where she is: the Timetable door on a desktop, and tabs at the foot of a phone that open it", async ({ page }) => {
  await timetableSwitch(sql, true);
  await page.goto(at("week"));
  await expect(page.locator("[data-bar] [data-door=timetable]").first()).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/today");
  const tabs = page.locator("nav[data-bar=doors]");
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Timetable" }).click();
  await expect(page).toHaveURL(/\/timetable/);
});

test("the old Your day and This week addresses are gone, with no redirect left behind", async ({ request }) => {
  // Nimish, 11 Nov 2026: "leave everything old behind, no traces of anything old"; nothing printed or sent links them
  for (const old of [`/educator?class=${klass}&day=${MONDAY}`, "/educator", `/educator/week?class=${klass}`, "/educator/week"]) {
    const res = await request.get(old, { maxRedirects: 0 });
    expect(res.status(), old).toBe(404);
  }
});

test("in the Week view no future cell carries a chip, and today's day head is marked when the week is this one", async ({ page }) => {
  await timetableSwitch(sql, true);
  await page.goto(at("week"));
  await expect(page.locator(`${GRID} [data-block=StatusChip]`)).toHaveCount(0);
  await expect(page.locator(`${GRID} .b-dh[aria-current=date]`)).toHaveCount(0); // a week not this one: no day is today's
  await page.goto(`/timetable?class=${klass}&view=week`); // this week: today's day head is marked
  const today = await page.evaluate(() => new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "Asia/Kolkata" })); // "Wed 11"
  const heads = (await page.locator(`${GRID} .b-dh`).allTextContents()).map((t) => t.trim());
  if (heads.includes(today)) await expect(page.locator(`${GRID} .b-dh[aria-current=date]`)).toHaveCount(1); // only when the week shown holds today
});

// UI-14 (#526): one source of colour and type for the whole site, so a page outside the shell has the tokens too.
test("the school's tokens load on every page: a page outside the shell has them and reads in Source Sans 3", async ({ page }) => {
  await page.goto("/children/assessments");
  const outside = await page.evaluate(() => ({
    token: getComputedStyle(document.documentElement).getPropertyValue("--state-ok").trim(),
    font: getComputedStyle(document.body).fontFamily,
  }));
  expect(outside.token).not.toBe("");
  expect(outside.font).toMatch(/^"?Source Sans 3/);
});
