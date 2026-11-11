/**
 * U78 (UI-6b) — the Timetable grid fits the screen: every day column is whole at 1440 and the page never scrolls sideways at 400
 * (specs/UI-6b/spec.md, the walkthrough defect). Stands on the U74 class and its fortnight (tests/timetable-rows.ts).
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { HERE, timetableRows, type Fixture } from "./timetable-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let f: Fixture;
test.beforeAll(async () => {
  f = await timetableRows(sql);
});
test.afterAll(() => sql.end());

const at = (page: Page, width: number, height = 900) => page.setViewportSize({ width, height });
const url = (view: string) => `/timetable?fn=${HERE}&class=${f.klass}&view=${view}`;

/** Every day head sits wholly inside the grid's own box, and the box itself has nothing left to scroll to. */
const fits = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector<HTMLElement>("[data-block=FortnightGrid]")!;
    const cut = box.getBoundingClientRect();
    const heads = [...box.querySelectorAll<HTMLElement>(".b-dh")].map((h) => h.getBoundingClientRect());
    return {
      heads: heads.length,
      boxScrolls: box.scrollWidth - box.clientWidth,
      outside: heads.filter((h) => h.left < cut.left - 1 || h.right > cut.right + 1).length,
      pageScrolls: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

for (const view of ["fortnight", "week"]) {
  test(`Timetable ${view} view at 1440: every day column is whole inside the grid, nothing to scroll`, async ({ page }) => {
    await at(page, 1440);
    await page.goto(url(view));
    await expect(page.locator("[data-block=FortnightGrid] .b-dh").first()).toBeVisible();
    const r = await fits(page);
    expect(r.heads).toBe(view === "fortnight" ? 10 : 5);
    expect(r.outside).toBe(0);
    expect(r.boxScrolls).toBeLessThanOrEqual(1);
    expect(r.pageScrolls).toBeLessThanOrEqual(0);
  });
}

test("Timetable at 400: the day view fits, and no view makes the page scroll sideways", async ({ page }) => {
  await at(page, 400, 800);
  await page.goto(url("day"));
  await expect(page.locator("[data-block=FortnightGrid] .b-dh").first()).toBeVisible();
  const day = await fits(page);
  expect(day.heads).toBe(1);
  expect(day.outside).toBe(0);
  expect(day.boxScrolls).toBeLessThanOrEqual(1);
  for (const view of ["week", "fortnight"]) {
    await page.goto(url(view));
    await expect(page.locator("[data-block=FortnightGrid] .b-dh").first()).toBeVisible();
    expect((await fits(page)).pageScrolls).toBeLessThanOrEqual(0); // the grid's own box may scroll; the page may not
  }
});
