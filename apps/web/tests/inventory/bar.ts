// The bar (`bar` in screens.json) is driven once per run, as the coordinator at 1440: each door opens its first screen from here and is
// lit, search is a typeahead, acting as is a spoken switch, help opens the guide, sign out ends the session and lands on Sign in.
import { expect, type Browser } from "@playwright/test";
import { signedInAs } from "../inventory-fixtures";
import type { Inventory } from "./load";

export async function driveBar(browser: Browser, inv: Inventory): Promise<string[]> {
  const out: string[] = [];
  const context = await signedInAs(browser, "coordinator", { width: 1440, height: 900 });
  const page = await context.newPage();
  await page.goto("/today");
  const bar = page.locator("[data-bar]").first();
  for (const e of inv.bar) {
    if (e.t === "link" && ["Today", "Timetable", "Children", "Setup"].includes(e.label)) {
      await bar.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: new RegExp(`^${e.label}`) }).click();
      await page.locator("h1").first().waitFor();
      // the lit door follows the walk a moment after the page changes
      await expect(bar.locator("[data-door][aria-current=page]").filter({ hasText: e.label }), `bar: after “${e.label}” the door is not lit`).toHaveCount(1).catch((x: Error) => out.push(x.message.split("\n")[0]));
    } else if (e.t === "link" && e.label === "?") {
      await bar.getByRole("link", { name: "Help" }).click();
      await page.waitForURL(/\/guide/, { timeout: 15_000 }).catch(() => out.push(`bar: “?” opened ${page.url()}, not the guide`));
    } else if (e.t === "field") {
      const box = bar.getByRole("combobox");
      if (!(await box.count())) out.push("bar: no search field");
    } else if (e.t === "switch") {
      const sw = bar.getByRole("switch");
      if (!(await sw.count()) || !(await sw.getAttribute("aria-checked"))) out.push("bar: Acting as is not a spoken switch");
    } else if (e.t === "button" && e.label === "Sign out") {
      await bar.getByRole("button", { name: "Sign out" }).click();
      await page.waitForURL(/\/login/);
    }
  }
  await context.close();
  return out;
}
