/**
 * U77 (UI-3h) — the class picture and the child's page as their wireframes have them (docs/frontend/wireframes/picture.html and child.html).
 * Whole counts only: nothing scores or ranks a child. The world is tests/children-world.ts.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { NAMES_A, childrenWorld } from "./children-world";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let classA = "";
let kids: Record<string, string> = {};

test.beforeAll(async () => {
  ({ classA, kids } = await childrenWorld(sql));
});
test.afterAll(async () => {
  await sql.end();
});
test.use({ viewport: { width: 1440, height: 900 } });

// The picture's rail, its clusters and "close to secure" were retired by the page charter's B5: the skill is chosen in the page's one primary
// action and the class is counted by the panel's four tiles (tests/u87-class-picture.spec.ts).

test("child · three cards in whole counts, the skills by state, and 'Skill by skill' with named days and what is next", async ({ page }) => {
  const child = kids[NAMES_A[0]];
  const [c] = await sql<{ roll_no: string }[]>`select roll_no from child_now where id = ${child}`;
  await page.goto(`/children/${classA}/${c.roll_no}`);
  await expect(page.getByText("Counts by state")).toBeVisible();
  await expect(page.getByText(/skills? seen in all · Sr\. No\. \d+ of \d+ in U72A/)).toBeVisible();
  await expect(page.locator("[data-last-seen] li").first()).toBeVisible();
  const np = page.locator("[data-notes-papers]");
  await expect(np).toContainText("Notes confirmed");
  await expect(np).toContainText("Papers read");
  await expect(np).toContainText("Corrections");
  await expect(np).toContainText("Newest entry");
  // no score, no rank anywhere on the cards
  await expect(page.locator("[data-block=Cards]").first()).not.toContainText(/%|rank|score/i);
  const bySkill = page.getByRole("table", { name: "Skill by skill" });
  await expect(bySkill.getByRole("columnheader")).toHaveText(["Skill", "Named days", "Last seen", "Ready next"]);
  // the same skills in both tables
  const top = await page.getByRole("table", { name: "Where this child is on each skill" }).locator("tbody tr").count();
  await expect(bySkill.locator("tbody tr")).toHaveCount(top);
});
