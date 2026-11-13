/**
 * U94 — the Question bank and a question as the page charter's Part C line draws them: "Question bank / a question: keep, Workspace"
 * (docs/frontend/page-charter.md, with Part A's Workspace and detail panel). The questions on the left; a question open on the right with
 * tabs Question · Change · About; the question's own address kept, as that panel opened full page; Remove (the coordinator's) works from
 * the panel as it did from the page. The question is one of the bank's generated questions that no other spec opens (the third by age),
 * put back ready to print after.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { signedInAs } from "./inventory-fixtures";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let key = "";

test.beforeAll(async () => {
  [{ item_key: key }] = await sql<{ item_key: string }[]>`select item_key from item where fmt = 'word_1step' and source = 'generated' and generator is distinct from 'correction' order by created_at, item_key offset 2 limit 1`;
  await sql`update item set status = 'active' where item_key = ${key}`;
});
test.afterAll(async () => {
  await sql`update item set status = 'active' where item_key = ${key}`;
  await sql.end();
});

const panel = (page: Page) => page.locator("[data-block=DetailPanel]");
const BANK = "/setup/question-bank";

test("the Question bank is a Workspace: the questions on the left, the bank counted on the right; a question opens there with Question · Change · About, and Escape closes it", async ({ page }) => {
  // the first question the bank lists for the skills taught, under every grade
  await page.goto(`${BANK}?grade=all`, { waitUntil: "networkidle" });
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(panel(page).locator("[data-stat=ready] .b-stat-n")).toHaveText(/^[\d,]+$/);
  const row = page.locator("main [data-question-row]").first();
  const shown = (await row.getAttribute("data-open-key"))!.replace("question:", "");
  await row.click();
  await expect(page).toHaveURL(/[?&]open=question%3A/);
  await expect(page).toHaveURL(/[?&]grade=all/); // the list's choices are kept beside the open question
  await expect(panel(page)).toHaveAttribute("data-open", `question:${shown}`);
  await expect(panel(page).getByRole("tab")).toHaveText(["Question", "Change", "About"]);
  await expect(panel(page).getByRole("img", { name: "The question as it prints on a paper" })).toHaveAttribute("src", `/api/question/${shown}`);
  await panel(page).getByRole("tab", { name: "About" }).click();
  await expect(panel(page).locator("[data-tab-body=about]")).toContainText(shown);
  await page.keyboard.press("Escape");
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  await expect(row).toBeFocused();
});

test("a question's own address still works: it is the panel opened full page, with the same tabs, and leads back to the bank with it open", async ({ page }) => {
  await page.goto(`${BANK}?grade=all&open=question:${key}`, { waitUntil: "networkidle" });
  await expect(panel(page).getByRole("link", { name: "Open full page" })).toHaveAttribute("href", `${BANK}/${key}`);
  await page.goto(`${BANK}/${key}`, { waitUntil: "networkidle" });
  const full = page.locator("[data-block=DetailPanel][data-inline]");
  await expect(full).toHaveAttribute("data-open", `question:${key}`);
  await expect(full.getByRole("tab")).toHaveText(["Question", "Change", "About"]);
  await expect(page.locator("[data-ux=action]").getByRole("link", { name: "Back to the question bank" })).toHaveAttribute("href", `${BANK}?grade=all&open=question%3A${key}`);
  // ?tab= opens the tab it names, so a link can open the Change tab
  await page.goto(`${BANK}/${key}?tab=change`, { waitUntil: "networkidle" });
  await expect(full.getByRole("tab", { name: "Change" })).toHaveAttribute("aria-selected", "true");
  await expect(full.getByLabel("The wording (required)")).toBeVisible();
});

test("Remove from the panel retires the question with its reason, never deletes it, and the panel shows it removed", async ({ page }) => {
  const [{ n: before }] = await sql<{ n: number }[]>`select count(*)::int as n from item`;
  await page.goto(`${BANK}?grade=all&open=question:${key}&tab=change`, { waitUntil: "networkidle" });
  await panel(page).getByLabel("Reason for removal (required)").fill("two answers are right");
  await panel(page).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(panel(page).locator("[data-question-state]")).toHaveAttribute("data-question-state", "removed", { timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`^[^?]*${BANK}\\?`)); // back on the bank, not the question's own page
  await expect(panel(page).locator("[data-removed]")).toContainText("It will not print again");
  const [{ status }] = await sql<{ status: string }[]>`select status from item where item_key = ${key}`;
  expect(status).toBe("retired");
  const [{ n: after }] = await sql<{ n: number }[]>`select count(*)::int as n from item`;
  expect(after).toBe(before);
  // a removed question has nothing to change
  await expect(panel(page).getByRole("tab")).toHaveText(["Question", "About"]);
});

test("an educator reads a question in the panel, with no Change tab", async ({ browser }) => {
  const context = await signedInAs(browser, "educator", { width: 1440, height: 900 });
  const page = await context.newPage();
  await page.goto(`${BANK}?grade=all&open=question:${key}`, { waitUntil: "networkidle" });
  await expect(panel(page).getByRole("tab")).toHaveText(["Question", "About"]);
  await expect(page.locator("[data-correct], [data-remove]")).toHaveCount(0);
  await context.close();
});
