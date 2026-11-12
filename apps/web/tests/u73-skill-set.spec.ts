/**
 * U73 (UI-3c) — the Skill set screen at /setup/skill-sets/[code]: each registry skill the set
 * covers is a card that opens the skill screen, and a set with none says so. The six functions the old page carried (a real question
 * per level, a grade per level, approving a way of asking, editing English samples, more like this, stopping a kind) are proved
 * by their own specs (u28, u34, e0, u54, u55, u64, u65), now at the new address.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";

const WITH = "U73.SS1";
const WITHOUT = "U73.SS2";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let registry = { code: "", name: "" };

test.beforeAll(async () => {
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  [registry] = await sql<{ code: string; name: string }[]>`select code, name from registry_skill where tenant_id = ${tenant} order by code limit 1`;
  const difficulty = sql.json({ Easy: { words: "Sorts two things.", check: {} } });
  for (const [code, rung, codes] of [[WITH, "U73S1", [registry.code]], [WITHOUT, "U73S2", [] as string[]]] as const)
    await sql`insert into skill (tenant_id, code, rung_code, name, learning_objective, difficulty, grade, descriptor, registry_codes)
      values (${tenant}, ${code}, ${rung}, ${"A test set " + code}, ${"Sorts things " + code}, ${difficulty}, 'G3', 'a test set', ${codes})
      on conflict (tenant_id, code) do nothing`;
});
test.afterAll(async () => {
  await sql.end();
});

test("a skill set opens in the new frame, each registry skill it covers is a card that opens the skill screen", async ({ page }) => {
  await page.goto(`/setup/skill-sets/${WITH}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Sorts things ${WITH}`);
  await expect(page.getByTestId("stage")).toContainText("Skill set");
  const card = page.locator("[data-block=Cards] article", { hasText: registry.name }).first();
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Open the skill" }).click();
  await expect(page).toHaveURL(new RegExp(`/setup/skills/${registry.code.replace(/\./g, "\\.")}`));
});

test("a skill set that covers no registry skill says so and invents nothing", async ({ page }) => {
  await page.goto(`/setup/skill-sets/${WITHOUT}`);
  await expect(page.getByText("No registry skill is linked to this skill set yet")).toBeVisible();
  await expect(page.locator("[data-block=Cards] article[data-kind=skill]")).toHaveCount(0);
});
