/**
 * U81 (#688 follow-up, Nimish 12 Nov 2026) — the pages use the whole screen. At 1920 px the main content spans at least 90 % of the
 * viewport on Today, Timetable, a Fortnight, Children and Setup (no 1560 px cap, token gutters); the same holds at 1440; the Live and
 * Planning rows name their fortnight with a link; the door's other pages are the page's rail, with the fold as the narrow fallback.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { HERE, timetableRows, type Fixture } from "./timetable-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let f: Fixture;
let wasOn = false;
test.beforeAll(async () => {
  f = await timetableRows(sql);
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true); // the fixture's fortnight under way is then Live
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const mainShare = async (page: Page) => {
  const w = await page.evaluate(() => document.documentElement.clientWidth);
  const box = await page.locator("main").boundingBox();
  return { share: (box?.width ?? 0) / w, scrolls: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth) };
};

for (const width of [1920, 1440]) {
  test(`at ${width} px the main content spans at least 90 % of the screen: Today, Timetable, Fortnight, Children, Setup`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    for (const path of ["/today", `/timetable?class=${f.klass}`, `/timetable/fortnight/${HERE}`, "/children", "/setup/needs-doing", "/"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      const { share, scrolls } = await mainShare(page);
      expect(share, `${path} at ${width}`).toBeGreaterThanOrEqual(0.9);
      expect(scrolls, `${path} scrolls sideways at ${width}`).toBe(false);
      // the bar and the footer are as wide as the main column
      const bar = await page.locator("[data-bar]").first().boundingBox();
      expect((bar?.width ?? 0) / width, `${path} bar`).toBeGreaterThanOrEqual(0.9);
    }
  });
}

test("at 1440 px the Timetable's filter row is one line: the pickers, the toggle, Previous, Next, Today and Open today share a row", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/timetable?class=${f.klass}`);
  await expect(page.locator("[data-block=FortnightGrid]")).toBeVisible();
  const row = page.locator(".tt-filters");
  const tops = await row.locator("select, [role=tab], a.chip, a.btn").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)));
  expect(tops.length).toBeGreaterThanOrEqual(6);
  expect(Math.max(...tops) - Math.min(...tops), `centres of the row's controls: ${tops.join(", ")}`).toBeLessThan(12);
});

test("a page with a rail fills it: the Timetable's rail holds the door's other pages, each with a second line", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/timetable?class=${f.klass}`);
  const rail = page.locator("[data-rail]");
  for (const name of ["Fortnight", "Draft from the rules", "Timetable rules", "Materials"]) {
    const link = rail.getByRole("link", { name, exact: false }).first();
    await expect(link, name).toBeVisible();
    await expect(link.locator("small"), name).not.toHaveText("");
  }
  // wide: the rail is the menu of the door and the fold is put away; narrow: the fold is a bordered button and it opens the same pages
  await expect(page.locator("[data-door-pages]")).toBeHidden();
  await page.setViewportSize({ width: 900, height: 900 });
  const fold = page.locator("[data-door-pages]").getByRole("button", { name: "Timetable pages" });
  await expect(fold).toBeVisible();
  expect(await fold.evaluate((e) => getComputedStyle(e).borderTopWidth)).not.toBe("0px");
});

test("the grid is the page: the filter row, the legend, then a subject-coloured block for every lesson, and Live or Planning is a chip", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/timetable?class=${f.klass}&view=fortnight`);
  // no table of fortnights above the grid: the first thing under the filter row and the legend is the grid
  await expect(page.locator("[data-block=FortnightGrid]")).toBeVisible(); // the page has streamed in
  await expect(page.locator("[data-section], [data-live-fortnight], [data-planning-fortnight]")).toHaveCount(0);
  const top = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
  expect(await top(".tt-filters")).toBeLessThan(await top("[data-legend]"));
  expect(await top("[data-legend]")).toBeLessThan(await top("[data-block=FortnightGrid]"));
  expect(await top("[data-block=FortnightGrid]"), "the grid starts in the first screen").toBeLessThan(500);
  // a block for every lesson (a session row), each in a subject's colour
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from session s join school_day d on d.id = s.school_day_id join fortnight g on d.on_date between g.starts_on and g.ends_on
    where s.school_class_id = ${f.klass} and g.number = ${HERE} and s.kind <> 'fixed'`;
  const blocks = page.locator("[data-block=FortnightGrid] .b-cell");
  await expect(blocks).toHaveCount(n);
  const fills = await blocks.evaluateAll((els) => els.map((e) => ({ subject: e.getAttribute("data-subject"), back: getComputedStyle(e).backgroundColor, edge: getComputedStyle(e).borderTopColor })));
  for (const x of fills) {
    expect(["numeracy", "language", "arts"]).toContain(x.subject);
    expect(x.back, "a block is tinted, not left on the page colour").not.toBe("rgba(0, 0, 0, 0)");
  }
  // the state is a chip beside the eyebrow, and the picker groups the fortnights
  await expect(page.getByTestId("stage").locator("[data-fortnight-state]")).toBeVisible();
  expect(await page.locator("select[name=fn] optgroup").count()).toBeGreaterThan(0);
  // the main action is in the filter row, as the wireframe draws it
  await expect(page.locator(".tt-filters").getByRole("link", { name: "Open today" })).toBeVisible();
});

test("the grid the engine will not show a coordinator is said in plain words, not in a success box", async ({ page }) => {
  await page.goto(`/timetable?class=${f.klass}`);
  const refused = page.locator("[data-grid-refused]");
  if (await refused.count()) {
    await expect(refused).toContainText("a class’s own educator and to staff whose current role is on the school’s coordinator list");
    await expect(refused).toContainText("ask the school’s head to add it");
    await expect(refused.getByRole("link", { name: /Open Fortnight/ })).toBeVisible();
    await expect(page.locator("[data-block=EmptyState]")).toHaveCount(0);
  }
});
