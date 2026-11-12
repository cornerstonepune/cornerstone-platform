import { expect, type Page } from "@playwright/test";
import { paperScreenOf } from "../lib/queries-assessment-extras";

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

const COORDINATOR = { role: "coordinator", classes: [], subjects: [], id: undefined };

/** The address of a copy's paper screen (by its sheet, its paper code or one of its answers), as the coordinator sees it: the address the
 *  site draws (lib/queries-assessment-extras.ts `paperScreenOf`). Fails the test when the copy has none. */
export async function paperAt(by: { sheet?: string; qr?: string; result?: string }): Promise<string> {
  const at = await paperScreenOf(by, COORDINATOR);
  expect(at, `a paper screen for ${JSON.stringify(by)}`).toBeTruthy();
  return at!.href;
}

/** The paper screen with one answer in view, as a row of What needs doing opens it. */
export const answerAt = async (answer: string) => `${await paperAt({ result: answer })}?answer=${answer}#a-${answer}`;
