/**
 * U74 (UI-11) — the four Setup content screens: Curriculum, Skills to approve, the Question bank, one question. One test for
 * each Done-when line of specs/UI-11/spec.md that a browser can check; the first test of each screen is its goal (what it is
 * for, SPEC.md). Rows are the test's own, put back after.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { aWaitingSkill } from "./rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
test.afterAll(async () => {
  await sql.end();
});

const waitingCount = async (page: Page) => Number((await page.getByTestId("stage").innerText()).match(/^(\d+) waiting$/)?.[1]);

/** Open Skills to approve on the page that holds `code`'s row. */
async function openRow(page: Page, code: string) {
  await page.goto("/setup/skills/approve");
  for (let i = 0; i < 40; i++) {
    if (await page.locator(`[data-row="${code}"]`).count()) return;
    const next = page.getByRole("link", { name: /next/i }).first();
    if (!(await next.count())) break;
    await next.click();
  }
}

test.describe("Skills to approve", () => {
  test("goal: read a waiting skill's levels and approve it on its own; the row leaves and the eyebrow drops by one", async ({ page }) => {
    const [{ code }] = await sql<{ code: string }[]>`select code from skill where status = 'draft' and level_approved <> '{}'::jsonb order by code limit 1`;
    const restore = await aWaitingSkill(sql, code);
    try {
      await openRow(page, code);
      const row = page.locator(`[data-row="${code}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(/Easy|Medium|Hard|Advance/); // its levels are read in the row
      const before = await waitingCount(page);
      await row.getByRole("button", { name: /^Approve/ }).click();
      await expect(page.locator(`[data-row="${code}"]`)).toHaveCount(0);
      expect(await waitingCount(page)).toBe(before - 1);
    } finally {
      await restore();
    }
  });

  test("approval is per row: every Approve button names one skill, and no control approves more", async ({ page }) => {
    await page.goto("/setup/skills/approve");
    const buttons = page.locator("main button", { hasText: /approve/i });
    const n = await buttons.count();
    expect(n).toBeLessThanOrEqual(10);
    for (let i = 0; i < n; i++) expect(await buttons.nth(i).getAttribute("aria-label")).toMatch(/^Approve .+/);
    await expect(page.getByRole("button", { name: /approve (all|every|these|the page)/i })).toHaveCount(0);
    await expect(page.locator("form", { has: page.locator("input[name=code]") }).first().locator("input[name=code]")).toHaveCount(1);
  });

  test("the eyebrow count equals the rows across all pages and is the only place the number is shown", async ({ page }) => {
    await page.goto("/setup/skills/approve");
    const n = await waitingCount(page);
    let rows = 0;
    for (let i = 0; i < 200; i++) {
      rows += await page.locator("[data-row]").count();
      const next = page.getByRole("link", { name: /next/i }).first();
      if (!(await next.count())) break;
      await next.click();
    }
    expect(rows).toBe(n);
    // nowhere else: not on the other pages of Setup, nor the bar
    for (const path of ["/setup/curriculum", "/setup/question-bank"]) {
      await page.goto(path);
      await expect(page.locator("body")).not.toContainText(new RegExp(`\\b${n} (waiting|skills to approve|to approve)`, "i"));
    }
  });
});
