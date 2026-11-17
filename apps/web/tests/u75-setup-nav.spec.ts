/**
 * U75 (UI-5, #690, page charter A1, then CP-65) — the menu and Setup. The menu is six lines (Today, Timetable, Children, Assessments,
 * Curriculum, Setup), each whole, on screen and big enough to press at 1440 and 400 px; the pages Setup holds (Staff, Classes, Timetable rules,
 * How it works) are its own page's four links, and each of them is lit under Setup in the menu (lib/menu.ts).
 */
import { expect, test } from "@playwright/test";
import { SECTIONS } from "../lib/menu";
import { menu } from "./menu";

const SETUP = SECTIONS.find((g) => g.key === "setup")!;
const HELD = [["Staff", "/setup/staff"], ["Classes", "/setup/classes"], ["Timetable rules", "/timetable/rules"], ["How it works", "/setup/how-it-works"]] as const;

for (const width of [1440, 400]) {
  test(`the six menu lines are whole, on screen and pressable at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/setup", { waitUntil: "networkidle" });
    const nav = await menu(page);
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(SECTIONS.length);
    for (const s of SECTIONS) await expect(nav.getByRole("link", { name: new RegExp(`^${s.label}`) }), s.label).toBeVisible();
    await expect(nav.locator("[aria-current=page]")).toHaveText(new RegExp(`^${SETUP.label}`));
    for (const box of await links.evaluateAll((as) => as.map((a) => { const r = a.getBoundingClientRect(); return { name: a.textContent, left: r.left, right: r.right, height: r.height }; }))) {
      expect(box.left, `${box.name} starts on screen`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${box.name} ends on screen`).toBeLessThanOrEqual(width);
      expect(box.height, `${box.name} is tall enough to press`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "the page does not scroll sideways").toBe(true);
  });
}

test("Setup holds Staff, Classes, Timetable rules and How it works, and the menu keeps Setup lit on each", async ({ page }) => {
  await page.goto("/setup");
  for (const [label] of HELD) await expect(page.getByRole("main").getByRole("link", { name: new RegExp(`Open ${label}`) }), label).toBeVisible();
  for (const [, href] of HELD) {
    await page.goto(href);
    await expect((await menu(page)).locator("[aria-current=page]"), href).toHaveText(new RegExp(`^${SETUP.label}`));
  }
});
