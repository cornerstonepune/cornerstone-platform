import type { Locator, Page } from "@playwright/test";

/** The sections of the menu (lib/menu.ts BAR_KEYS, CP-66): the same for everyone. Setup is in the person's menu, not here. */
export const SECTIONS = { coordinator: ["My day", "Timetable", "Children", "Assessments", "Curriculum", "Money"], educator: ["My day", "Timetable", "Children", "Assessments", "Curriculum", "Money"] } as const;

/** Under this width the menu is the tab bar at the foot of the screen (components/frame/top-nav.tsx). */
const PHONE = 900;
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) <= PHONE;

/** The menu (components/frame/top-nav.tsx): the links in the top bar from 901 px wide; under that, the tab bar at the foot. A spec reads
 *  or presses a page of the menu through this. */
export async function menu(page: Page): Promise<Locator> {
  return page.locator(isPhone(page) ? "nav[data-tabbar]" : "nav[data-topnav]").first();
}

/** The person's menu (components/frame/person.tsx), opened: the account, Acting as, Setup and its four, help and sign out. */
export async function you(page: Page): Promise<Locator> {
  const box = page.locator("[data-bar]").first().locator("#person-menu");
  if (!(await box.isVisible())) await page.locator("[data-bar]").first().getByRole("button", { name: /: account$/ }).click();
  return box;
}

/** The section names of a menu, in order, as written. */
export const sectionNames = (nav: Locator) => nav.locator("[data-section-label]").allTextContents();

/** The section lit (the walk's own: lib/menu.ts, components/frame/walk.tsx), by its words. */
export const litSection = (page: Page) =>
  page.locator(`${isPhone(page) ? "nav[data-tabbar]" : "nav[data-topnav]"} [data-section-group][data-lit] [data-section-label]`).first();
