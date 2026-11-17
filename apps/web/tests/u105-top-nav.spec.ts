/**
 * U105 — the top navigation bar (CP-66, Nimish 17 Nov 2026: "should we move on the top side so that the whole page becomes available").
 * The side menu is gone: one white bar carries the logo, Today, Timetable, Children, Assessments, Curriculum, then search and the person's
 * menu, which holds Setup and its four pages. On a phone the menu is a tab bar of at most five at the foot of the screen.
 */
import { expect, test } from "@playwright/test";
import { menu, sectionNames, SECTIONS, you } from "./menu";

const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 400, height: 800 };

test("1. at 1440 there is no side menu, and the top bar shows the links in order", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto("/today");
  await expect(page.locator("[data-sidebar], aside nav[aria-label=Menu]")).toHaveCount(0);
  const nav = page.locator("header[data-bar] nav[data-topnav]");
  await expect(nav).toBeVisible();
  expect(await sectionNames(nav)).toEqual([...SECTIONS.coordinator]);
  // the page under the bar starts at the left edge: the whole width is the page's
  expect((await page.getByRole("main").boundingBox())!.x).toBeLessThan(8);
  await expect(page.locator("nav[data-tabbar]")).toBeHidden();
});

test("2. Setup's four links are reachable from the person's menu", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize(WIDE);
  for (const [label, path] of [["Staff", "/setup/staff"], ["Classes", "/setup/classes"], ["Timetable rules", "/timetable/rules"], ["How it works", "/setup/how-it-works"]] as const) {
    await page.goto("/today");
    const box = await you(page);
    await box.getByRole("link", { name: label, exact: true }).click();
    await page.waitForURL((u) => u.pathname === path);
    await expect(page.locator("h1").first(), label).toBeVisible();
  }
});

test("3. at 400 px a tab bar has at most five items, and the page has no horizontal scroll", { tag: "@core" }, async ({ page }) => {
  await page.setViewportSize(PHONE);
  for (const path of ["/today", "/children", "/children/assessments", "/setup/curriculum"]) {
    await page.goto(path);
    const bar = await menu(page);
    await expect(bar).toBeVisible();
    const n = await bar.getByRole("link").count();
    expect(n, path).toBeGreaterThan(0);
    expect(n, path).toBeLessThanOrEqual(5);
    await expect(page.locator("nav[data-topnav]")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(400);
    // every label shows whole, the bold one on the active tab included
    const cut = await bar.locator("[data-section-label]").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(cut, path).toEqual([]);
  }
});

test("4. the active page is marked in the bar", { tag: "@core" }, async ({ page }) => {
  for (const vp of [WIDE, PHONE])
    for (const [path, label] of [["/timetable", "Timetable"], ["/children", "Children"], ["/setup/curriculum", "Curriculum"]] as const) {
      await page.setViewportSize(vp);
      await page.goto(path);
      const on = (await menu(page)).locator("[aria-current=page]");
      await expect(on, `${path} at ${vp.width}`).toHaveCount(1);
      await expect(on.locator("[data-section-label]"), `${path} at ${vp.width}`).toHaveText(label);
    }
});
