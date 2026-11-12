/**
 * U75 (UI-5, then #690 step B, then the page charter A1) — the setup pages. Setup has many pages; in one strip they ran off the right edge at
 * 1440, then folded behind "Setup pages". Since the charter they are the School section of the sidebar (a drawer on a phone): one test per
 * width: every page whole, inside the screen and big enough to press, under its section, and the page does not scroll sideways because of
 * it. Nothing was removed: the pages are the section's own list (lib/menu.ts).
 */
import { expect, test } from "@playwright/test";
import { SECTIONS } from "../lib/menu";
import { menu } from "./menu";

const SCHOOL = SECTIONS.find((g) => g.key === "school")!;

for (const width of [1440, 400]) {
  test(`every School page is whole, on screen and pressable at ${width} px, under its section of the menu`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/setup/staff", { waitUntil: "networkidle" });
    const nav = await menu(page);
    const list = nav.getByRole("list", { name: SCHOOL.label });
    const links = list.getByRole("link");
    await expect(links).toHaveCount(SCHOOL.pages.length);
    for (const p of SCHOOL.pages) await expect(list.getByRole("link", { name: p.label, exact: true }), p.label).toBeVisible();
    await expect(nav.locator("[aria-current=page]")).toHaveText("Staff");
    for (const box of await links.evaluateAll((as) => as.map((a) => { const r = a.getBoundingClientRect(); return { name: a.textContent, left: r.left, right: r.right, height: r.height }; }))) {
      expect(box.left, `${box.name} starts on screen`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${box.name} ends on screen`).toBeLessThanOrEqual(width);
      expect(box.height, `${box.name} is tall enough to press`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "the page does not scroll sideways").toBe(true);
  });
}
