import { expect, type Page } from "@playwright/test";

/** Open one child's paper on the paper screen the way an educator does: from the assessments list for a class, through the assessment, to the
 *  copy with a link to check it. (An old spec went by the paper's id; the paper screen is addressed by the class, week, skill and Sr. No.) */
export async function openPaper(page: Page, section: string, roll: string, week?: string) {
  await page.goto(`/children/assessments?class=${encodeURIComponent(section)}&view=table${week ? `&week=${encodeURIComponent(week)}` : ""}`);
  await page.locator("a[data-assessment-row]").first().click();
  const copy = page.locator("tr", { has: page.locator("td", { hasText: new RegExp(`^${roll}$`) }) }).locator("[data-check-paper]");
  await expect(copy).toHaveCount(1);
  await copy.click();
  await expect(page.getByRole("heading", { name: "Check the answers" })).toBeVisible();
}

/** The answer in the table whose question reads like this, opened in the panel under it (waits for the page that link goes to, not the one before). */
export async function openAnswer(page: Page, text: string | RegExp) {
  const link = page.getByRole("table", { name: "The answers" }).getByRole("link", { name: text }).first();
  const id = (await link.getAttribute("href"))!.match(/answer=([0-9a-f-]+)/)![1];
  await link.click();
  await expect(page).toHaveURL(new RegExp(`answer=${id}(&|#|$)`));
  const panel = page.getByRole("region", { name: "Say what the child wrote" });
  await expect(panel).toHaveAttribute("id", `a-${id}`);
  return panel;
}

/** The screen a home or chosen paper opens on when it is made (its address is the assessment, class, week and Sr. No.), and the code of the child's newest paper. */
export const PAPER_SCREEN = /\/children\/assessments\/[^/]+\/\d+$/;
export async function landedOn(page: Page, sql: import("postgres").Sql, child: string): Promise<string> {
  await expect(page).toHaveURL(PAPER_SCREEN);
  const [r] = await sql<{ qr: string }[]>`select qr_code as qr from sheet_instance where child_id = ${child}::uuid and print_status <> 'void' order by created_at desc limit 1`;
  return r.qr;
}
