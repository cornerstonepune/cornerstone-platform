/**
 * U52 — Saying what was taught is a row of What needs doing (goals/nav3_what_needs_doing.yaml). Nimish, 2026-10-22: "make it
 * easy to navigate"; 26 Oct 2026: "I don't understand the purpose of this teaching page". Wednesday's step is one group of
 * What needs doing, a row for each topic with its own button; Curriculum's next step is What needs doing, and its old page's
 * address opens it.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aClass } from "./rows";
import { panel, workAt } from "./today-work";

// What waits to be marked taught is a class's topics: a fresh copy has no class, and CI splits the specs across runners, so
// the spec makes its own rather than lean on one that ran before it
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
test.beforeAll(async () => {
  await aClass(sql, "U52-CLASS", "G2", ["Asha"]);
});
test.afterAll(async () => sql.end());

test("a topic waiting to be marked taught is a row with its own button, in the group that opens Curriculum", async ({ page }) => {
  await page.goto(workAt("taught"));
  const group = panel(page);
  await expect(group.locator("a[data-panel-full]")).toHaveAttribute("href", "/");
  const rows = group.locator("tr[data-kind=taught]");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) await expect(row.getByRole("button", { name: "Mark as taught" })).toHaveCount(1);
  // skills are approved in Setup, never here
  await expect(group.getByRole("button", { name: /approve/i })).toHaveCount(0);
});

test("Curriculum's next step is What needs doing", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-ux=next]").click();
  await expect(page).toHaveURL(/\/today$/);
});
