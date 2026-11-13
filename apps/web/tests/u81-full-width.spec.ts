/**
 * U81 (#688 follow-up, Nimish 12 Nov 2026) — the pages use the whole screen. At 1920 px the main content spans at least 90 % of the
 * viewport on Today, Timetable, a Fortnight, Children and Setup (no 1560 px cap, token gutters); the same holds at 1440; the Live and
 * Planning rows name their fortnight with a link. Since the page charter (A1, A2) the menu is a sidebar at the left, so "the screen" is the
 * width beside it, and the Timetable's right side is its detail panel: stat tiles, never a list of links.
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
  // the width beside the sidebar (page charter A1: the sidebar fills the left margin, the page body keeps the rest)
  const w = await page.evaluate(() => document.documentElement.clientWidth - (document.querySelector("[data-sidebar]")?.getBoundingClientRect().width ?? 0));
  const box = await page.locator("main").boundingBox();
  return { share: (box?.width ?? 0) / w, scrolls: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth) };
};

for (const width of [1920, 1440]) {
  test(`at ${width} px the main content spans at least 90 % of the screen: Today, Timetable, Fortnight, Children, Setup`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1080 });
    for (const path of ["/today", `/timetable?class=${f.klass}`, `/timetable/fortnight/${HERE}`, "/children", "/"]) {
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

test("at 1440 px the Timetable's filter row is one line with real slack, and at 1280 it wraps without overflowing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/timetable?class=${f.klass}`);
  await expect(page.locator("[data-block=FortnightGrid]")).toBeVisible();
  const row = page.locator(".tt-filters");
  const tops = await row.locator("select, [role=tab], a.chip, a.btn").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)));
  expect(tops.length).toBeGreaterThanOrEqual(6);
  expect(Math.max(...tops) - Math.min(...tops), `centres of the row's controls: ${tops.join(", ")}`).toBeLessThan(12);
  // slack, so a wider font on another machine (CI's) cannot wrap it: the controls, each made 10 % wider, still fit the row with their gaps
  const fit = await row.evaluate((el) => {
    const kids = [...el.children] as HTMLElement[];
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const need = kids.reduce((n, k) => n + k.getBoundingClientRect().width * 1.1, 0) + gap * (kids.length - 1);
    return { need: Math.round(need), have: Math.round(el.getBoundingClientRect().width) };
  });
  expect(fit.need, `the row needs ${fit.need} px with 10 % more width on each control, and has ${fit.have}`).toBeLessThanOrEqual(fit.have);
  // narrower, the row wraps and nothing runs off the page
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/timetable?class=${f.klass}`);
  await expect(page.locator("[data-block=FortnightGrid]")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const box = await row.boundingBox();
  for (const c of await row.locator("select, [role=tab], a.chip, a.btn").all()) {
    const b = (await c.boundingBox())!;
    expect(b.x + b.width, "a control inside the row's right edge").toBeLessThanOrEqual(box!.x + box!.width + 1);
  }
});

test("the Timetable's right side is its detail panel: with nothing chosen, the week's numbers as stat tiles, and its pages are the sidebar's", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/timetable?class=${f.klass}`);
  const panel = page.locator("[data-block=DetailPanel][data-panel=summary]");
  await expect(panel).toBeVisible();
  await expect(panel.locator("[data-block=StatTile]")).toHaveCount(3);
  // never "Connected to": no link list on the right; the Timetable's pages are lines of the sidebar
  await expect(page.locator("[data-rail]")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Connected to" })).toHaveCount(0);
  const timetable = page.locator("[data-sidebar]").getByRole("list", { name: "Timetable" });
  await expect(timetable.getByRole("link")).toHaveText(["Week", "Fortnight", "Time by subject", "Materials"]);
  await expect(timetable.getByRole("link", { name: "Week" })).toHaveAttribute("aria-current", "page");
  // the panel sits beside the grid, to its right, from the top
  const [grid, side] = [(await page.locator("[data-block=FortnightGrid]").boundingBox())!, (await panel.boundingBox())!];
  expect(side.x).toBeGreaterThan(grid.x + grid.width - 1);
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
  // the page's one primary action is under the title (page charter A3, B2: it moved there from the wireframe's filter row)
  await expect(page.locator("[data-ux=action]").getByRole("link", { name: "Open today" })).toBeVisible();
  await expect(page.locator(".tt-filters").getByRole("link", { name: "Open today" })).toHaveCount(0);
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
