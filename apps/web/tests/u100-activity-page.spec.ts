/**
 * U100 (CP-53, issue #773): the activity on one screen, every part editable, the machine's links shown everywhere with their tag, a white
 * site. One test per Done-when line; the rows are U94's (tests/u94-rows.ts: an activity whose thinking the machine drafted and whose
 * objective and skill it linked, the rest from the sheet), put back as they were before each test.
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
  await sql`delete from activity_material where activity_code = ${MACHINE}`;
  await gate(sql, "open"); // the curriculum's gate lets the tester in as a reviewer
});
test.afterAll(async () => {
  await sql`delete from activity_material where activity_code = ${MACHINE}`;
  await u94Rows(sql);
  await gate(sql, "closed");
  await sql.end();
});

test("1 · one screen, no tabs: what the child learns, how to mark (the lesson page's rubric), steps, thinking, materials, where it sits, taught", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAMES[MACHINE]);
  await expect(page.getByRole("tab")).toHaveCount(0);
  for (const s of ["learns", "rubric", "steps", "thinking", "materials", "where", "taught"]) await expect(page.locator(`[data-section="${s}"]`)).toBeVisible();
  const rubric = page.locator('[data-section="rubric"] [data-block="Rubric"] [data-level]');
  await expect(rubric).toHaveText([/U94 zero/, /U94 one/, /U94 two/, /U94 three/]);
  // an old address with a tab still opens the one screen
  await page.goto(`${PAGE}?tab=objectives`);
  await expect(page.locator('[data-section="rubric"]')).toBeVisible();
});

test("2 · a reviewer edits a part from the sheet in place, and it becomes the person's", async ({ page }) => {
  await page.goto(PAGE);
  const part = page.locator('[data-section="learns"] [data-part="objective"]');
  await expect(part).toHaveAttribute("data-source", "school");
  await part.locator("summary", { hasText: "Edit" }).click();
  await part.locator("textarea, input[name=text]").first().fill("U100 the child counts blocks and says how many");
  await part.getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[data-section="learns"] [data-part="objective"]')).toContainText("U100 the child counts blocks and says how many");
  await expect(page.locator('[data-section="learns"] [data-part="objective"]')).toHaveAttribute("data-source", "person");
  const [{ source }] = await sql<{ source: string }[]>`select source from activity_part_source where activity_code = ${MACHINE} and part = 'objective'`;
  expect(source).toBe("person");
  // a level of the rubric too, from its own Edit under the rubric
  await page.locator('[data-levels] [data-part="level_1"] summary', { hasText: "Edit" }).click();
  const level = page.locator('[data-levels] [data-part="level_1"]');
  await level.locator("textarea, input[name=text]").first().fill("U100 counts to five with help");
  await level.getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[data-block="Rubric"] [data-level="1"]')).toContainText("U100 counts to five with help");
});

test("3 · a reviewer adds, changes and removes materials as items with a count; the rows are what the lesson page reads", async ({ page }) => {
  const items = async () =>
    (await sql<{ name: string; quantity: number | null }[]>`
      select i.name, m.quantity::float8 as quantity from activity_material m join material_item i on i.tenant_id = m.tenant_id and i.code = m.material_code
      where m.activity_code = ${MACHINE} order by m.ord`).map((r) => [r.name, r.quantity]);
  await page.goto(PAGE);
  const box = page.locator('[data-section="materials"]');
  await box.locator("summary", { hasText: "Edit the materials" }).click();
  await box.getByLabel("Material 1").fill("U100 counting blocks");
  await box.getByLabel("How many").first().fill("10");
  await box.getByLabel("Material 2").fill("U100 tray");
  await box.getByRole("button", { name: "Save the materials" }).click();
  await expect(page.locator('[data-section="materials"] [data-materials] li')).toHaveText([/U100 counting blocks\s*× 10/, /U100 tray/]);
  expect(await items()).toEqual([["U100 counting blocks", 10], ["U100 tray", null]]);
  // change one count, take the other out
  await page.locator('[data-section="materials"] summary', { hasText: "Edit the materials" }).click();
  await page.locator('[data-section="materials"]').getByLabel("How many").first().fill("12");
  await page.locator('[data-section="materials"]').getByLabel("Material 2").fill("");
  await page.locator('[data-section="materials"]').getByRole("button", { name: "Save the materials" }).click();
  await expect(page.locator('[data-section="materials"] [data-materials] li')).toHaveText([/U100 counting blocks\s*× 12/]);
  expect(await items()).toEqual([["U100 counting blocks", 12]]);
});

test("5 · the machine's links show with their tag wherever they are listed: the activity, the objective, the skill and Curriculum", async ({ page }) => {
  await page.goto(PAGE);
  // a machine-made objective the machine linked carries the symbol for each: shown, never hidden
  await expect(page.locator("[data-objective-row]").filter({ hasText: "U94 counts blocks to ten" }).locator("[data-machine]").first()).toBeVisible();
  await expect(page.locator("[data-skill-link]").filter({ hasText: skill.name }).locator("[data-machine]").first()).toBeVisible();
  await page.goto(`/setup/objectives/${LO_MACHINE}`);
  await expect(page.locator("[data-machine]").first()).toBeVisible();
  await page.goto(`/setup/curriculum?q=U94`);
  await expect(page.locator(`tr[data-row="${MACHINE}"] [data-machine]`).first()).toBeVisible();
});

test("6 · the skill page lists the objectives and the activities linked to it, each saying where its link came from", async ({ page }) => {
  await page.goto(`/setup/skills/${encodeURIComponent(skill.code)}`);
  const rail = page.locator("[data-rail-link]");
  await expect(rail.filter({ hasText: "U94 counts blocks to ten" })).toContainText("Linked by the machine · to approve");
  await expect(rail.filter({ hasText: NAMES[MACHINE] })).toContainText("Linked by the machine · to approve");
  await expect(rail.filter({ hasText: NAMES[MACHINE] })).toHaveAttribute("href", PAGE);
});

test("4 · Approve all of this activity makes the machine's parts and links the person's: no tag is left on the page", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator("main [data-machine]").first()).toBeVisible();
  await page.getByRole("button", { name: /Approve all of this activity/ }).click();
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  await expect(page.locator("main [data-machine]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve all of this activity/ })).toHaveCount(0);
  const left = await sql`select 1 from activity_skill where activity_code = ${MACHINE} and source = 'machine' union all select 1 from activity_objective where activity_code = ${MACHINE} and source = 'machine'`;
  expect(left).toHaveLength(0);
});

test("7 · the page is near-white and the menu a neutral grey, from the tokens", async ({ page }) => {
  await page.goto(PAGE);
  const bg = (sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bg("body")).toBe("rgb(251, 251, 250)");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--menu").trim())).toBe("#f5f5f4");
});

test("8 · a person the curriculum lets look but not review sees the same page with no Edit and no Approve", async ({ page }) => {
  await gate(sql, "look");
  await page.goto(PAGE);
  await expect(page.locator('[data-section="rubric"]')).toBeVisible();
  await expect(page.locator("[data-answers], [data-materials-edit]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Approve all of this activity/ })).toHaveCount(0);
});
