/**
 * U53 — The menu is the educator's week (goals/uxn3-the-menu.yaml). Nimish, 2026-10-22: "make sure that the navigation and
 * all the menu items are perfect", "complete, in the order of the educator's week". Each step of the week is a menu item
 * named as its page is titled; the current page is marked; only Today carries a count; nothing in it names a subject.
 */
import { expect, test } from "@playwright/test";

const GROUPS = ["Today", "Timetable", "Children", "Setup"];
// every page of the week, with the door it is in and the words of its own title (or its tab)
const PAGES = [
  ["/today", "Today", "What needs doing"],
  ["/timetable/rules", "Timetable", "Timetable rules"],
  // bare, its address opens Assessments filtered to what waits for approval
  ["/papers/approve", "Children", "Assessments"],
  ["/papers", "Children", "Assessments"],
  ["/capture", "Children", "Upload papers"],
  ["/capture/check", "Children", "Check answers"],
  ["/growth", "Children", "Class results"],
  ["/", "Setup", "Curriculum"],
  ["/library", "Setup", "Question bank"],
] as const;

test("the menu lists the four groups in order, and each page is marked and titled by its own words", async ({ page }) => {
  await page.goto("/today");
  const menu = page.locator("[data-bar]").first().getByRole("navigation", { name: "Sections" });
  const names = (await menu.getByRole("link").allInnerTexts()).map((n) => n.replace(/\s*\d[\d,]*$/, "").trim());
  expect(names).toEqual(GROUPS);
  for (const [path, group, label] of PAGES) {
    await page.goto(path);
    await expect(menu.locator("[aria-current=page]"), path).toHaveText(new RegExp(`^${group}`));
    // the page is marked in the door's row of pages, and says the same words in its title or its stage line
    await expect(page.getByRole("navigation", { name: "Pages in this section" }).locator("[aria-current=page]"), path).toHaveText(label);
  }
});

test("only What needs doing carries a count, and no word of the menu names a subject", async ({ page }) => {
  await page.goto("/growth");
  const menu = page.locator("[data-bar]").first().getByRole("navigation", { name: "Sections" });
  expect(await menu.getByTestId("waiting").count()).toBeLessThanOrEqual(1);
  expect(await page.locator("[data-bar]").first().innerText()).not.toMatch(/\b(maths|english|hindi|science|evs)\b/i);
});

test("no step of the week is a dead end: each page of the menu ends on a next step or opens one", async ({ page }) => {
  for (const [path] of PAGES) {
    await page.goto(path);
    // a page on the shared blocks has its next-step link; Marking and the old Today open the places to do each thing
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const next = await page.locator("[data-ux=next]").count();
    expect(next + (await page.getByRole("main").getByRole("link").count()), `${path}: a way on`).toBeGreaterThan(0);
  }
  await page.goto("/today");
  await expect(page.locator("[data-ux=next]")).toHaveAttribute("href", "/papers");
});
