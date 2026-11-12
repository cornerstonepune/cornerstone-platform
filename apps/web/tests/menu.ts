import type { Locator, Page } from "@playwright/test";

/** The sections of the sidebar (lib/menu.ts, page charter A1): the same for everyone (Nimish, 12 Nov: School too, read-only). */
export const SECTIONS = { coordinator: ["My day", "Timetable", "Children", "Assessments", "School"], educator: ["My day", "Timetable", "Children", "Assessments", "School"] } as const;

/** The menu (components/frame/sidebar.tsx): the sidebar from 701 px wide, opened out if it was folded to icons; on a phone the drawer behind
 *  the bar's Menu button, opened. A spec reads or presses a page of the menu through this. */
export async function menu(page: Page): Promise<Locator> {
  if ((page.viewportSize()?.width ?? 1440) <= 700) {
    const open = page.locator("dialog[data-menu-drawer][open]");
    if (!(await open.count())) await page.locator("[data-bar]").first().getByRole("button", { name: "Menu", exact: true }).click();
    return open.getByRole("navigation", { name: "Menu" });
  }
  const side = page.locator("[data-sidebar]");
  if (await page.locator("[data-sidebar][data-folded]").count()) await side.getByRole("button", { name: "Open the menu" }).click();
  return side.getByRole("navigation", { name: "Menu" });
}

/** The section headings of a menu, in order, as written (not as the eyebrow style shows them, in capitals). */
export const sectionNames = (nav: Locator) => nav.getByRole("heading", { level: 2 }).allTextContents();

/** The section lit (the walk's own: lib/menu.ts, components/frame/walk.tsx), by its heading's words. */
export const litSection = (page: Page) => page.locator("[data-sidebar] [data-section-group][data-lit] h2, [data-sidebar] [data-section-group][data-lit] a").first();
