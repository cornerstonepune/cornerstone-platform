// The journey harness (Athena's UI rule): a journey is a list of steps, each opens a page and runs axe on it.
// Signed in by the project's own session (playwright.config.ts, the "journey" project), never a login path of its own.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

export { expect, test };

/**
 * Open a page and run axe on it. The violations are always attached to the report. `strict` fails the step on any:
 * a slice that builds or restyles a page sets it, so its page leaves clean; the pages not yet touched (colour contrast
 * is UI-14's) are reported, not failed, so one slice does not carry every other slice's debt.
 */
export async function step(page: Page, path: string, heading: string | RegExp, strict = false): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).analyze();
  const found = violations.map((v) => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.help}`).join("\n");
  await test.info().attach(`axe ${path}`, { body: found || "no violations", contentType: "text/plain" });
  if (strict) expect(violations, found).toEqual([]);
}
