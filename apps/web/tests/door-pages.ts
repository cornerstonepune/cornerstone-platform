import type { Page } from "@playwright/test";

/** The lit door's other pages (components/frame/doors.tsx DoorPages): one nav row only, so they fold behind "<Door> pages" at the end of
 *  the trail. This opens the panel (when it is shut) and gives the nav, so a spec can see or press a page of the door. */
export async function doorPages(page: Page) {
  const nav = page.getByRole("navigation", { name: "Pages in this section" });
  const fold = nav.getByRole("button");
  if ((await fold.getAttribute("aria-expanded")) === "false") await fold.click();
  return nav;
}
