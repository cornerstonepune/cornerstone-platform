/**
 * U75 (UI-5) — the Setup door's second row. Setup has thirteen pages; in one strip they ran off the right edge at 1440 ("Sc…" clipped).
 * The pages now sit in labelled groups that wrap. One test: at 1440 and at 400 every page is there, whole, inside the screen and big enough
 * to press, and the page itself does not scroll sideways because of it. Nothing was removed: the pages are the door's own list (lib/menu.ts).
 */
import { expect, test } from "@playwright/test";
import { GROUPS } from "../lib/menu";

const SETUP = GROUPS.find((g) => g.key === "setup")!;

for (const width of [1440, 400]) {
  test(`every Setup page is whole, on screen and pressable at ${width} px, in groups`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/setup/staff", { waitUntil: "networkidle" });
    const row = page.getByRole("navigation", { name: "Pages in this section" });
    const links = row.getByRole("link");
    await expect(links).toHaveCount(SETUP.pages.length);
    for (const p of SETUP.pages) await expect(row.getByRole("link", { name: p.label, exact: true }), p.label).toBeVisible();
    for (const box of await links.evaluateAll((as) => as.map((a) => { const r = a.getBoundingClientRect(); return { name: a.textContent, left: r.left, right: r.right, height: r.height }; }))) {
      expect(box.left, `${box.name} starts on screen`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${box.name} ends on screen`).toBeLessThanOrEqual(width);
      expect(box.height, `${box.name} is tall enough to press`).toBeGreaterThanOrEqual(44);
    }
    const headings = [...new Set(SETUP.pages.map((p) => p.group))];
    for (const h of headings) await expect(row.getByRole("list", { name: h }), `the group ${h}`).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "the page does not scroll sideways").toBe(true);
  });
}
