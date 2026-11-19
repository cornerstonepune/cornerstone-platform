/**
 * U129 (Nimish, 19 Nov 2026): the curriculum detail pages. The four pages open, the path above the title links up the tree, one section of
 * an activity edits and saves on its own, and none of them scrolls sideways on a phone. Rows are U94's (an activity the machine drafted,
 * the objective it is linked to and a skill).
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { gate } from "./m1-13-rows";
import { LO_MACHINE, MACHINE, NAMES, u94Rows } from "./u94-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const PAGE = `/setup/activities/${MACHINE}`;
let skill = { code: "", name: "" };

test.beforeEach(async () => {
  skill = (await u94Rows(sql)).skills[0];
  await gate(sql, "open");
});
test.afterAll(async () => {
  await u94Rows(sql);
  await gate(sql, "closed");
  await sql.end();
});

test("1 · the activity opens with its path; the objective in the path opens, and its skill opens in turn", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAMES[MACHINE]);
  for (const s of ["run", "lay", "watch", "mark", "connects", "taught", "details"]) await expect(page.locator(`[data-section="${s}"]`)).toBeVisible();
  const trail = page.getByRole("navigation", { name: "Where you are" });
  await expect(trail.getByRole("link").first()).toHaveText("Curriculum");
  await trail.getByRole("link", { name: "U94 counts blocks to ten" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("U94 counts blocks to ten");
  await expect(page.getByRole("link", { name: NAMES[MACHINE] })).toBeVisible();
  await page.locator("[data-skill-link] a").first().click();
  await expect(page.getByRole("heading", { name: "What it is" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Used in/ })).toBeVisible();
});

test("2 · Edit on one section opens only that section's form, and saving it keeps the page and its other sections", async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('[data-section="run"]').getByRole("link", { name: "Edit run it" }).click();
  await expect(page.locator("form textarea")).toHaveCount(1);
  await page.locator('[data-section="run"] textarea').fill("U129 first step\nU129 second step");
  await page.locator('[data-section="run"]').getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[data-section="run"] li')).toHaveText(["U129 first step", "U129 second step"]);
  await expect(page.locator('[data-section="mark"] [data-level]')).toHaveCount(4);
  await sql`update activity set steps = 'Lay out the blocks', steps_list = null where code = ${MACHINE}`;
});

test("3 · Approve makes the machine's parts and links the person's", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator("[data-machine-line]")).toBeVisible();
  await page.locator("[data-approve]").click();
  await expect(page.locator("[data-machine-line]")).toHaveCount(0);
});

test("4 · the four pages do not scroll sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  for (const url of [PAGE, `/setup/objectives/${LO_MACHINE}`, `/setup/skills/${encodeURIComponent(skill.code)}`, "/setup/skill-sets/ADD.1D1D"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), url).toBe(true);
  }
});
