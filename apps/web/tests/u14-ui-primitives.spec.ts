/**
 * UI-14 — the shadcn Button and Tabs (components/ui) are on the school's tokens: their look is a committed baseline.
 * Each primitive is rendered by React (tests/render-ui.mjs), placed on a real page of the site (so the site's own built CSS
 * styles it), and compared with its screenshot. Sign in is not needed: the page is only a carrier for the CSS.
 * The baseline records shape, colour, border, corner and shadow, which this slice sets; the words are masked and every
 * control has a fixed width, because two Chromium builds lay the same text out a pixel or two apart (CI's run was 7 px
 * wider than the laptop's). That the words are in the school's fonts is proven by UI-14's line 8, on every page.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// tests/render-ui.mjs renders the real components in a plain Node process (see its header for why)
const render = (what: "button" | "tabs") =>
  execFileSync(process.execPath, [path.join(__dirname, "render-ui.mjs"), what], { encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" } });

async function show(page: Page, markup: string, width: number) {
  await page.goto("/login");
  await page.evaluate(([html, w]) => {
    document.body.innerHTML = `<style>[data-ui14] button{width:112px}[data-ui14] [role=tablist]{width:220px}</style>
      <main data-ui14 style="padding:24px;width:${w}px;box-sizing:border-box">${html}</main>`;
  }, [markup, width] as const);
  await page.evaluate(() => document.fonts.ready);
  return page.locator("[data-ui14]");
}

test("the Button, every variant, is on the tokens", async ({ page }) => {
  const markup = render("button");
  const box = await show(page, markup, 776);
  const main = page.locator("[data-ui14] button").first();
  expect(await main.evaluate((e) => getComputedStyle(e).borderRadius)).toBe("10px"); // radius-control
  expect(await main.evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44); // tap
  await expect(box).toHaveScreenshot("button.png", { mask: [page.locator("[data-ui14] [data-label]")], maxDiffPixelRatio: 0.01 });
});

test("the Tabs, one chosen, are on the tokens", async ({ page }) => {
  const markup = render("tabs");
  const box = await show(page, markup, 300);
  const chosen = page.locator('[data-ui14] [data-state="active"]').first();
  expect(await chosen.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe("none"); // shadow-card
  await expect(box).toHaveScreenshot("tabs.png", { mask: [page.locator("[data-ui14] [data-label]")], maxDiffPixelRatio: 0.01 });
});
