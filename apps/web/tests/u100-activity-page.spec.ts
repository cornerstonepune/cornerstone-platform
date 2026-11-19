/**
 * U100 (CP-53, issue #773): the activity page, every part editable, the machine's links shown everywhere with their tag, a white
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
  // U94's rows put back its objective, steps and thinking; the levels an earlier test edited are put back here
  await sql`update activity set level_0 = 'U94 zero', level_1 = 'U94 one', level_2 = 'U94 two', level_3 = 'U94 three' where code = ${MACHINE}`;
  await gate(sql, "open"); // the curriculum's gate lets the tester in as a reviewer
});
test.afterAll(async () => {
  await sql`delete from activity_material where activity_code = ${MACHINE}`;
  await u94Rows(sql);
  await gate(sql, "closed");
  await sql.end();
});

test("2 · a reviewer edits a part from the sheet in place, and it becomes the person's", async ({ page }) => {
  await page.goto(`${PAGE}?edit=run`);
  await page.locator('[data-section="run"] textarea').fill("U100 count the blocks\nU100 say how many");
  await page.locator('[data-section="run"]').getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[data-section="run"] li')).toHaveText(["U100 count the blocks", "U100 say how many"]);
  const [{ source }] = await sql<{ source: string }[]>`select source from activity_part_source where activity_code = ${MACHINE} and part = 'steps'`;
  expect(source).toBe("person");
  // the four levels of How to mark are one form, from the section's own Edit
  await page.locator('[data-section="mark"]').getByRole("link", { name: "Edit how to mark" }).click();
  await page.locator('[data-section="mark"] textarea[name=level_1]').fill("U100 counts to five with help");
  await page.locator('[data-section="mark"]').getByRole("button", { name: "Save the levels" }).click();
  await expect(page.locator('[data-block="Rubric"] [data-level="1"]')).toContainText("U100 counts to five with help");
});

test("3 · a reviewer adds, changes and removes materials as items with a count; the rows are what the lesson page reads", async ({ page }) => {
  const items = async () =>
    (await sql<{ name: string; quantity: number | null }[]>`
      select i.name, m.quantity::float8 as quantity from activity_material m join material_item i on i.tenant_id = m.tenant_id and i.code = m.material_code
      where m.activity_code = ${MACHINE} order by m.ord`).map((r) => [r.name, r.quantity]);
  await page.goto(PAGE);
  const box = page.locator('[data-section="lay"]');
  await box.getByRole("link", { name: "Edit lay out" }).click();
  await box.getByLabel("Material 1").fill("U100 counting blocks");
  await box.getByLabel("How many").first().fill("10");
  await box.getByLabel("Material 2").fill("U100 tray");
  await box.getByRole("button", { name: "Save the materials" }).click();
  await expect(page.locator('[data-section="lay"] [data-materials] li')).toHaveText([/U100 counting blocks\s*× 10/, /U100 tray/]);
  expect(await items()).toEqual([["U100 counting blocks", 10], ["U100 tray", null]]);
  // change one count, take the other out
  await page.locator('[data-section="lay"]').getByRole("link", { name: "Edit lay out" }).click();
  await page.locator('[data-section="lay"]').getByLabel("How many").first().fill("12");
  await page.locator('[data-section="lay"]').getByLabel("Material 2").fill("");
  await page.locator('[data-section="lay"]').getByRole("button", { name: "Save the materials" }).click();
  await expect(page.locator('[data-section="lay"] [data-materials] li')).toHaveText([/U100 counting blocks\s*× 12/]);
  expect(await items()).toEqual([["U100 counting blocks", 12]]);
});

test("5 · the machine's links show with their tag wherever they are listed: the activity, the objective, the skill and Curriculum", async ({ page }) => {
  await page.goto(PAGE);
  // a machine-made objective the machine linked carries the symbol for each: shown, never hidden
  await expect(page.locator("[data-objective-row]").filter({ hasText: "U94 counts blocks to ten" }).locator("[data-machine]").first()).toBeVisible();
  await expect(page.locator("[data-skill-link]").filter({ hasText: skill.name }).locator("[data-machine]").first()).toBeVisible();
  await page.goto(`/setup/objectives/${LO_MACHINE}`);
  await expect(page.locator("[data-machine]").first()).toBeVisible();
  await page.goto(`/setup/curriculum?view=appendix&q=U94`);
  await expect(page.locator(`tr[data-row="${MACHINE}"] [data-machine]`).first()).toBeVisible();
});

test("6 · the skill page lists the objectives and the activities that use it, each a link to its page", async ({ page }) => {
  await page.goto(`/setup/skills/${encodeURIComponent(skill.code)}`);
  const used = page.locator("#used");
  await expect(used.getByRole("link", { name: "U94 counts blocks to ten" })).toHaveAttribute("href", `/setup/objectives/${LO_MACHINE}`);
  await expect(used.getByRole("link", { name: NAMES[MACHINE] })).toHaveAttribute("href", PAGE);
});

test("4 · Approve makes the machine's parts and links the person's: no tag is left on the page", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator("main [data-machine]").first()).toBeVisible();
  await page.locator("[data-approve]").click();
  await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  await expect(page.locator("main [data-machine]")).toHaveCount(0);
  await expect(page.locator("[data-approve]")).toHaveCount(0);
  const left = await sql`select 1 from activity_skill where activity_code = ${MACHINE} and source = 'machine' union all select 1 from activity_objective where activity_code = ${MACHINE} and source = 'machine'`;
  expect(left).toHaveLength(0);
});

test("8 · a person the curriculum lets look but not review sees the same page with no Edit and no Approve", async ({ page }) => {
  await gate(sql, "look");
  await page.goto(PAGE);
  await expect(page.locator('[data-section="mark"]')).toBeVisible();
  await expect(page.locator("[data-edit]")).toHaveCount(0);
  await expect(page.locator("[data-approve]")).toHaveCount(0);
});
