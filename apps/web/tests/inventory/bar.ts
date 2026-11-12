// The bar (`bar` in screens.json) is driven once per run, as the coordinator at 1440: the logo opens Today, each section's first page of the
// sidebar opens and lights its section, the Menu button folds the sidebar to icons and back, search is a typeahead, acting as is a spoken
// switch, help opens the guide, sign out ends the session and lands on Sign in.
import { expect, type Browser } from "@playwright/test";
import { signedInAs } from "../inventory-fixtures";
import type { Inventory } from "./load";
import { litSection, menu } from "../menu";

export async function driveBar(browser: Browser, inv: Inventory): Promise<string[]> {
  const out: string[] = [];
  const context = await signedInAs(browser, "coordinator", { width: 1440, height: 900 });
  const page = await context.newPage();
  await page.goto("/today");
  const bar = page.locator("[data-bar]").first();
  for (const e of inv.bar) {
    if (e.t === "link" && e.label === "Today") {
      await bar.getByRole("link", { name: "Cornerstone Gurukul", exact: true }).click();
      await page.waitForURL(/\/today/).catch(() => out.push(`bar: the logo opened ${page.url()}, not Today`));
    } else if (e.t === "link" && e.label === "A page of the menu") {
      const nav = await menu(page);
      for (const [section, line] of [["Timetable", "Week"], ["Children", "Class picture"], ["Assessments", "Assessments"], ["School", "Curriculum"], ["My day", "Today"]] as const) {
        await (await menu(page)).getByRole("list", { name: section }).getByRole("link", { name: new RegExp(`^${line}`) }).click();
        await page.locator("h1").first().waitFor();
        // the lit section follows the walk a moment after the page changes
        await expect(litSection(page), `menu: after “${line}” its section is not lit`).toHaveText(section).catch((x: Error) => out.push(x.message.split("\n")[0]));
      }
      if (!(await nav.count())) out.push("menu: no sidebar");
    } else if (e.t === "button" && e.label === "Menu") {
      const side = page.locator("[data-sidebar]");
      await side.getByRole("button", { name: "Fold the menu to icons" }).click();
      if ((await side.getAttribute("data-folded")) === null) out.push("menu: the sidebar did not fold to icons");
      await side.getByRole("button", { name: "Open the menu" }).click();
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
