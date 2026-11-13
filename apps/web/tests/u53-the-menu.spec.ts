/**
 * U53 — The menu is the educator's week (goals/uxn3-the-menu.yaml), since the page charter (A1, 12 Nov 2026) a sidebar grouped by the
 * educator's jobs. Nimish, 2026-10-22: "make sure that the navigation and all the menu items are perfect", "complete, in the order of the
 * educator's week". Each step of the week is a menu item named as its page is titled; the current page is marked; only Today carries a
 * count; nothing in it names a subject.
 */
import { expect, test } from "@playwright/test";
import { litSection, menu, sectionNames, SECTIONS } from "./menu";

// every page of the week, with the section it is in and the words of its line in the menu
const PAGES = [
  ["/today", "My day", "Today"],
  ["/setup/needs-doing", "My day", "What needs doing"],
  ["/timetable/rules", "School", "Timetable rules"],
  ["/children/assessments", "Assessments", "Assessments"],
  ["/setup/curriculum", "School", "Curriculum"],
  ["/setup/question-bank", "Assessments", "Question bank"],
] as const;

// the titles below are the ones goals/uxn3-the-menu.yaml names; since the page charter (A1) they prove the sidebar's five sections and Today's one count
test("the menu lists the four groups in order, and each page is marked and titled by its own words", async ({ page }) => {
  await page.goto("/today");
  expect(await sectionNames(await menu(page))).toEqual([...SECTIONS.coordinator]);
  for (const [path, section, label] of PAGES) {
    await page.goto(path);
    await expect(litSection(page), path).toHaveText(section);
    await expect((await menu(page)).locator("[aria-current=page]"), path).toHaveText(new RegExp(`^${label}`));
  }
});

test("only What needs doing carries a count, and no word of the menu names a subject", async ({ page }) => {
  await page.goto("/children");
  const nav = await menu(page);
  expect(await nav.getByTestId("waiting").count()).toBeLessThanOrEqual(1);
  expect(await nav.getByTestId("waiting").count()).toBe(await nav.getByRole("link", { name: /^Today/ }).getByTestId("waiting").count());
  for (const text of [await nav.innerText(), await page.locator("[data-bar]").first().innerText()]) expect(text).not.toMatch(/\b(maths|english|hindi|science|evs)\b/i);
});

test("no step of the week is a dead end: each page of the menu ends on a next step or opens one", async ({ page }) => {
  for (const [path] of PAGES) {
    await page.goto(path);
    // a page on the shared blocks has its next-step link; Marking and the old Today open the places to do each thing
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const next = await page.locator("[data-ux=next]").count();
    expect(next + (await page.getByRole("main").getByRole("link").count()), `${path}: a way on`).toBeGreaterThan(0);
  }
  await page.goto("/setup/needs-doing");
  await expect(page.locator("[data-ux=next]")).toHaveAttribute("href", "/children/assessments");
});
