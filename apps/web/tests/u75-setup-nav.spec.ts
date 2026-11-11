/**
 * U75 (UI-5, then #690 step B) — the Setup door's pages. Setup has many pages; in one strip they ran off the right edge at 1440. Since
 * #690 the site has one nav row (the bar), as the wireframes draw it: the door's pages fold behind "Setup pages" at the end of the trail.
 * One test per width: no row of tabs under the bar; one press opens every page, whole, inside the screen and big enough to press, in its
 * group; the page does not scroll sideways because of it. Nothing was removed: the pages are the door's own list (lib/menu.ts).
 */
import { expect, test } from "@playwright/test";
import { GROUPS } from "../lib/menu";

const SETUP = GROUPS.find((g) => g.key === "setup")!;

for (const width of [1440, 400]) {
  test(`every Setup page is whole, on screen and pressable at ${width} px, in groups, behind one button (one nav row)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/setup/staff", { waitUntil: "networkidle" });
    // one nav row: nothing under the bar is a row of the door's pages
    await expect(page.locator("[data-bar] nav[aria-label='Pages in this section']")).toHaveCount(0);
    const row = page.getByRole("navigation", { name: "Pages in this section" });
    const fold = row.getByRole("button", { name: `${SETUP.label} pages` });
    await expect(fold).toHaveAttribute("aria-expanded", "false");
    expect((await fold.boundingBox())!.height, "the fold is a big tap").toBeGreaterThanOrEqual(44);
    await expect(row.getByRole("link")).toHaveCount(0);
    await fold.click();
    await expect(fold).toHaveAttribute("aria-expanded", "true");
    const links = row.getByRole("link");
    await expect(links).toHaveCount(SETUP.pages.length);
    for (const p of SETUP.pages) await expect(row.getByRole("link", { name: p.label, exact: true }), p.label).toBeVisible();
    await expect(row.locator("[aria-current=page]")).toHaveText("Staff");
    for (const box of await links.evaluateAll((as) => as.map((a) => { const r = a.getBoundingClientRect(); return { name: a.textContent, left: r.left, right: r.right, height: r.height }; }))) {
      expect(box.left, `${box.name} starts on screen`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${box.name} ends on screen`).toBeLessThanOrEqual(width);
      expect(box.height, `${box.name} is tall enough to press`).toBeGreaterThanOrEqual(44);
    }
    const headings = [...new Set(SETUP.pages.map((p) => p.group))];
    for (const h of headings) await expect(row.getByRole("list", { name: h }), `the group ${h}`).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "the page does not scroll sideways").toBe(true);
    // Escape shuts it again
    await page.keyboard.press("Escape");
    await expect(fold).toHaveAttribute("aria-expanded", "false");
  });
}
