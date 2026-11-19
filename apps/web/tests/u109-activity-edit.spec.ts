/**
 * U109 (CP-70, issue #837) — a coordinator edits an activity on its own page: its name, the objectives and skills it is tied to, its grades,
 * and takes one change back. Done-when 9 of specs/CP-70/spec.md, a test for each thing the page does (its steps, materials and four levels
 * are edited by the page's older editors, held by U100; the engine's lines are packages/engine/tests/test_curriculum_edit.py). The spec's own
 * rows: an activity and an objective of Grade 2 with made-up words; the grade it is added to is left as it was found.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { gate } from "./m1-13-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const HOME = "G2";
const MATHS = "NUM";
const UNIT = "U109 unit";
const ACT = "ACT-G2-U109";
const LO = "LO-U109-A";
const NAME = "U109 counting beads";
const PAGE = `/setup/activities/${ACT}`;
let tenant = "";
let skill = { code: "", name: "" };
let before: { enabled: unknown; roles: unknown; grant: boolean };

const hook = (page: Page) => ({ set: async (body: { match?: string; delayMs?: number; fail?: boolean; expire?: boolean }) => void (await page.request.post("/api/test-hooks", { data: body })) });
const unitUrl = `/setup/curriculum?grade=${HOME}&subject=${MATHS}&unit=${encodeURIComponent(UNIT)}`;
const leaf = (page: Page) => page.locator(`[data-objective-leaf="${LO}"]`);
const D = `${PAGE}?open=details`; // the Details fold at the foot, open
const learns = (page: Page) => page.locator('[data-section="connects"]');
const where = (page: Page) => page.locator('[data-section="details"]');
const changes = (page: Page) => page.locator('[data-section="details"]');

test.beforeAll(async () => {
  const [en] = await sql<{ v: unknown }[]>`select value as v from config where key = 'educator.timetable_enabled'`;
  const [ro] = await sql<{ v: unknown }[]>`select value as v from config where key = 'curriculum.review_roles'`;
  const [g] = await sql`select 1 from staff_role_grant where granted_by = 'm1-13b test' and valid_to is null`;
  before = { enabled: en?.v, roles: ro?.v, grant: !!g };
  await gate(sql, "reviewer"); // the tester holds the role `head`, a coordinator's
  [{ id: tenant }] = await sql<{ id: string }[]>`select tenant_id as id from subject where code = ${MATHS} limit 1`;
  [skill] = await sql<{ code: string; name: string }[]>`select code, name from registry_skill where tenant_id = ${tenant} order by code limit 1`;
  await sql`
    insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code)
    values (${tenant}, ${LO}, ${HOME}, 'Numeracy', ${UNIT}, 'U109 objective A', 'Foundational', 'school', ${MATHS})
    on conflict (tenant_id, code) do update set unit = excluded.unit, title = excluded.title, band = excluded.band, also_bands = '{}', retired = false`;
  await sql`
    insert into activity (tenant_id, code, band, strand, name, objective, materials, steps, level_0, level_1, level_2, level_3)
    values (${tenant}, ${ACT}, ${HOME}, 'Maths', ${NAME}, 'U109 what it is for', 'Beads', 'Lay out the beads', 'U109 zero', 'U109 one', 'U109 two', 'U109 three')
    on conflict (tenant_id, code) do update set name = excluded.name, band = excluded.band, also_bands = '{}', objective = excluded.objective, materials = excluded.materials, steps = excluded.steps, steps_list = null,
      level_0 = excluded.level_0, level_1 = excluded.level_1, level_2 = excluded.level_2, level_3 = excluded.level_3`;
  await sql`delete from activity_objective where tenant_id = ${tenant} and activity_code = ${ACT}`;
  await sql`delete from activity_skill where tenant_id = ${tenant} and activity_code = ${ACT}`;
  await sql`delete from activity_material where tenant_id = ${tenant} and activity_code = ${ACT}`;
  // the skill the activity may be linked to is one of its grade's: found through an objective of the grade
  await sql`insert into learning_objective_skill (tenant_id, lo_code, skill_code, source) values (${tenant}, ${LO}, ${skill.code}, 'school') on conflict do nothing`;
});

test.afterAll(async () => {
  await sql`delete from activity_objective where tenant_id = ${tenant} and activity_code = ${ACT}`;
  await sql`delete from activity_skill where tenant_id = ${tenant} and activity_code = ${ACT}`;
  await sql`delete from learning_objective_skill where tenant_id = ${tenant} and lo_code = ${LO}`;
  await sql`update learning_objective set retired = true where tenant_id = ${tenant} and code = ${LO}`;
  await gate(sql, before.grant ? "reviewer" : "closed");
  await sql`update config set value = ${sql.json(before.enabled as boolean)} where key = 'educator.timetable_enabled'`;
  await sql`update config set value = ${sql.json(before.roles as string[])} where key = 'curriculum.review_roles'`;
  await sql.end();
});

test.beforeEach(async ({ page }) => {
  // what the server keeps is NOT let go of by the clock here: only an edit's own call to curriculumChanged() can make the tree show it
  await hook(page).set({ expire: false, match: "", delayMs: 0, fail: false });
});

test("1. the page shows steps, materials, the four levels, links and a Details fold, each section with its own Edit; a new name is saved as a person's", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
  await expect(page.locator('[data-section="run"]')).toContainText("Lay out the beads");
  await expect(page.locator('[data-section="lay"]')).toContainText("Beads");
  await expect(page.locator('[data-block="Rubric"] [data-level]')).toHaveText([/U109 zero/, /U109 one/, /U109 two/, /U109 three/]);
  for (const s of ["run", "lay", "watch", "mark", "connects"]) await expect(page.locator(`[data-edit="${s}"]`)).toBeVisible();
  await page.goto(D);
  await expect(where(page).locator(`[data-grades] [data-grade="${HOME}"]`)).toBeVisible();
  await page.locator("#ae-name").fill("U109 counting beads in tens");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("U109 counting beads in tens");
  const [log] = await sql<{ n: number }[]>`select count(*)::int as n from change_log where tenant_id = ${tenant} and table_name = 'activity' and row_id = ${ACT} and staff_id is not null and after ? 'name'`;
  expect(log.n, "the change is in the history under a person").toBeGreaterThan(0);
});

test("2. the history says the change in plain words, and Undo takes it back as a new change", async ({ page }) => {
  await page.goto(D);
  const first = changes(page).locator("[data-change]").first();
  await expect(first).toContainText("Name");
  await expect(first).toContainText("U109 counting beads in tens");
  await first.getByRole("button", { name: "Undo: Name" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
  // the undo is itself the newest change; the one it took back is still there, and has no Undo now (a later change touched the name)
  await expect(changes(page).locator('[data-change="Name"]')).toHaveCount(2);
  await expect(changes(page).locator('[data-change="Name"]').nth(1).getByRole("button", { name: /Undo/ })).toHaveCount(0);
});

test("3. an objective and a skill are linked and removed, and the Curriculum tree shows the tie at once", async ({ page }) => {
  // what the server kept on an earlier run is let go of once, so the tree below is read afresh from the rows this run has just made
  await hook(page).set({ expire: true, match: "", delayMs: 0, fail: false });
  await page.goto(unitUrl);
  await expect(leaf(page)).toBeVisible();
  await expect(leaf(page).locator('[title="Activities"]')).toHaveCount(0); // no activity builds toward it yet
  await hook(page).set({ expire: false, match: "", delayMs: 0, fail: false }); // from here only the edit's own call can change the tree
  await page.goto(`${PAGE}?edit=connects`);
  await learns(page).locator('[data-choice="' + LO + '"]').getByRole("button", { name: /^Link/ }).click();
  await expect(learns(page).locator("[data-objective-row]")).toContainText("U109 objective A");
  await page.goto(`${PAGE}?edit=connects&kind=skill&find=${encodeURIComponent(skill.name)}`);
  await learns(page).locator(`[data-choice="${skill.code}"]`).getByRole("button", { name: /^Link/ }).click();
  await expect(learns(page).locator("[data-skill-link]")).toContainText(skill.name);
  const [tied] = await sql<{ lo: string; sk: string }[]>`
    select (select source from activity_objective where tenant_id = ${tenant} and activity_code = ${ACT} and lo_code = ${LO}) as lo,
           (select source from activity_skill where tenant_id = ${tenant} and activity_code = ${ACT} and skill_code = ${skill.code}) as sk`;
  expect(tied, "both ties are a person's").toEqual({ lo: "person", sk: "person" });
  await page.goto(unitUrl);
  await expect(leaf(page).locator('[title="Activities"]'), "the tree counts the activity with no wait").toHaveText("1");
  await page.goto(`${PAGE}?edit=connects`);
  await learns(page).getByRole("button", { name: "Remove link to U109 objective A" }).click();
  await expect(learns(page).locator("[data-objective-row]")).toHaveCount(0);
  await learns(page).getByRole("button", { name: `Remove link to ${skill.name}` }).click();
  await expect(learns(page).locator("[data-skill-link]")).toHaveCount(0);
  await page.goto(unitUrl);
  await expect(leaf(page), "the objective itself stays").toBeVisible();
  await expect(leaf(page).locator('[title="Activities"]')).toHaveCount(0);
});

test("4. a grade is added and removed; the last grade has no Remove, so an activity always stays in a grade", async ({ page }) => {
  await page.goto(D);
  await expect(where(page).locator("[data-grades]").getByRole("button", { name: /Take out of/ })).toHaveCount(0);
  await page.locator("#ae-grade").selectOption("G1");
  await where(page).getByRole("button", { name: "Add grade" }).click();
  await expect(where(page).locator('[data-grades] [data-grade="G1"]')).toBeVisible();
  const [row] = await sql<{ band: string; also: string[] }[]>`select band, also_bands as also from activity where tenant_id = ${tenant} and code = ${ACT}`;
  expect(row).toEqual({ band: HOME, also: ["G1"] });
  await expect(changes(page).locator("[data-change]").first()).toContainText("Grade added");
  await where(page).locator('[data-grade="G1"]').getByRole("button", { name: /Take out of/ }).click();
  await expect(where(page).locator('[data-grades] [data-grade="G1"]')).toHaveCount(0);
  await expect(where(page).locator(`[data-grades] [data-grade="${HOME}"]`)).toBeVisible();
});

test("5. a person who may only look sees the page with nothing to edit", async ({ page }) => {
  await gate(sql, "look");
  try {
    await page.goto(D);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
    await expect(where(page)).toContainText("Grade 2");
    for (const control of ["[data-name-edit]", "[data-grades]", "[data-tie-add]", "[data-untie]", "[data-change]", "[data-edit]", "[data-answers]"]) await expect(page.locator(control)).toHaveCount(0);
  } finally {
    await gate(sql, "reviewer");
  }
});

test("6. at 400 px the edits work, each control is 44 px tall and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto(`${PAGE}?edit=connects&kind=skill`);
  await learns(page).locator(`[data-choice="${skill.code}"]`).getByRole("button", { name: /^Link/ }).click();
  await expect(learns(page).locator("[data-skill-link]")).toContainText(skill.name);
  const connects = '[data-tie-add] :is(button, input:not([type=hidden])), [data-untie]';
  for (const b of await page.locator(connects).all()) {
    const box = await b.boundingBox();
    expect(box && box.height >= 44, "each control is at least 44 px tall").toBe(true);
  }
  await page.goto(D);
  await page.locator("#ae-name").fill("U109 on a phone");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("U109 on a phone");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const controls = '[data-name-edit] :is(button, input:not([type=hidden])), [data-grades] :is(button, select), [data-section="details"] button';
  for (const b of await page.locator(controls).all()) {
    const box = await b.boundingBox();
    expect(box && box.height >= 44, "each control is at least 44 px tall").toBe(true);
  }
  await changes(page).getByRole("button", { name: "Undo: Name" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
});
