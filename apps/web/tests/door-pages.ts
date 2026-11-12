import type { Page } from "@playwright/test";

/** The sidebar (components/frame/sidebar.tsx): the pages of every section, always in view from 701 px wide. On a phone it is a drawer, so
 *  this opens it when it is shut. A spec can see or press any page of the site's menu from the result. */
export async function doorPages(page: Page) {
  const nav = page.getByRole("navigation", { name: "Sections" });
  if (!(await nav.isVisible())) await page.locator("[data-menu-button]").click();
  return nav;
}
