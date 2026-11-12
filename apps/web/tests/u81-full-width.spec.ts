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

test("a page with a rail fills it: the Timetable's rail holds the door's other pages, each with a second line", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/timetable?class=${f.klass}`);
  const rail = page.locator("[data-rail]");
  for (const name of ["Moves by hand", "Draft from the rules", "Timetable rules", "Materials"]) {
    const link = rail.getByRole("link", { name });
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

test("the Live and Planning rows name their fortnight with a link, and the whole row opens its grid", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/timetable?class=${f.klass}`);
  const live = page.locator(`[data-section=live] [data-live-fortnight='${HERE}']`);
  const name = live.getByRole("link", { name: `Fortnight ${HERE}`, exact: true }).first();
  await expect(name).toBeVisible();
  for (const col of ["Fortnight", "Dates", "State", "Lessons placed"]) await expect(page.locator("[data-section=live]").getByRole("columnheader", { name: col })).toBeVisible();
  // a click on the row, away from the name and the actions, follows the name's link
  const box = await live.boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.45, box!.y + box!.height / 2);
  await expect(page).toHaveURL(new RegExp(`fn=${HERE}`));
});

test("the grid the engine will not show a coordinator is said in plain words, not in a success box", async ({ page }) => {
  await page.goto(`/timetable?class=${f.klass}`);
  const refused = page.locator("[data-grid-refused]");
  if (await refused.count()) {
    await expect(refused).toContainText("shown only to a class’s own educator");
    await expect(refused).toContainText("ask the school’s head to allow coordinators");
    await expect(refused.getByRole("link", { name: /Open Fortnight/ })).toBeVisible();
    await expect(page.locator("[data-block=EmptyState]")).toHaveCount(0);
  }
});
