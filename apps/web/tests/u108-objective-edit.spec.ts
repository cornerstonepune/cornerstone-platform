/**
 * U108 (CP-70, issue #837) — a coordinator edits an objective where it is shown, and puts it in another grade. One test for each website
 * Done-when line of specs/CP-70/spec.md (the engine's lines are packages/engine/tests/test_curriculum_edit.py). The spec's rows sit in Grade 2,
 * with made-up words; the grades they are added to are left as they were found.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { gate } from "./m1-13-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const HOME = "G2";
const MATHS = "NUM";
const UNIT = "U108 unit A";
const A = "LO-U108-A";
const B = "LO-U108-B";
let tenant = "";
let before: { enabled: unknown; roles: unknown; grant: boolean };

const hook = (page: Page) => ({ set: async (body: { match?: string; delayMs?: number; fail?: boolean; expire?: boolean }) => void (await page.request.post("/api/test-hooks", { data: body })) });
const tree = (page: Page) => page.locator("[data-curriculum-tree]");
const unitUrl = (grade: string) => `/setup/curriculum?grade=${grade}&subject=${MATHS}&unit=${encodeURIComponent(UNIT)}`;
const leaf = (page: Page, code: string) => page.locator(`[data-objective-leaf="${code}"]`);
const openEdit = async (page: Page, code: string) => {
  await page.goto(unitUrl(HOME));
  await leaf(page, code).click();
  await expect(page.locator('[data-panel="open"]')).toBeVisible();
  await page.getByRole("tab", { name: "Edit" }).click();
  await expect(page.locator("[data-objective-edit]")).toBeVisible();
};

test.beforeAll(async () => {
  const [en] = await sql<{ v: unknown }[]>`select value as v from config where key = 'educator.timetable_enabled'`;
  const [ro] = await sql<{ v: unknown }[]>`select value as v from config where key = 'curriculum.review_roles'`;
  const [g] = await sql`select 1 from staff_role_grant where granted_by = 'm1-13b test' and valid_to is null`;
  before = { enabled: en?.v, roles: ro?.v, grant: !!g };
  await gate(sql, "reviewer"); // the tester holds the role `head`, a coordinator's
  [{ id: tenant }] = await sql<{ id: string }[]>`select tenant_id as id from subject where code = ${MATHS} limit 1`;
  for (const code of [A, B])
    await sql`
      insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code)
      values (${tenant}, ${code}, ${HOME}, 'Numeracy', ${UNIT}, ${`U108 objective ${code.slice(-1)}`}, 'Foundational', 'school', ${MATHS})
      on conflict (tenant_id, code) do update set unit = excluded.unit, title = excluded.title, band = excluded.band, also_bands = '{}', source = 'school', retired = false`;
});

test.afterAll(async () => {
  await sql`update learning_objective set retired = true where tenant_id = ${tenant} and code like 'LO-U108-%'`;
  await gate(sql, before.grant ? "reviewer" : "closed");
  await sql`update config set value = ${sql.json(before.enabled as boolean)} where key = 'educator.timetable_enabled'`;
  await sql`update config set value = ${sql.json(before.roles as string[])} where key = 'curriculum.review_roles'`;
  await sql.end();
});

test.beforeEach(async ({ page }) => {
  // what the server keeps is NOT let go of by the clock here: only the edit's own call to curriculumChanged() can make the tree show it
  await hook(page).set({ expire: false, match: "", delayMs: 0, fail: false });
});

test("1. an edit of the title is on the tree at once, and the row then reads as a person's", { tag: "@core" }, async ({ page }) => {
  // what the server kept on an earlier run is let go of once, so the tree below is read afresh from the rows this run has just made
  await hook(page).set({ expire: true, match: "", delayMs: 0, fail: false });
  await page.goto(unitUrl(HOME));
  await expect(leaf(page, A)).toContainText("U108 objective A");
  await expect(leaf(page, A)).not.toContainText("said better");
  await hook(page).set({ expire: false, match: "", delayMs: 0, fail: false }); // from here only the edit's own call can make the tree show a change
  await openEdit(page, A);
  await page.locator("#oe-title").fill("U108 objective A, said better");
  await page.locator("#oe-unit").fill(UNIT);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(leaf(page, A)).toContainText("U108 objective A, said better");
  const [row] = await sql<{ source: string; title: string }[]>`select source, title from learning_objective where tenant_id = ${tenant} and code = ${A}`;
  expect(row).toEqual({ source: "person", title: "U108 objective A, said better" });
  const [log] = await sql<{ n: number }[]>`select count(*)::int as n from change_log where tenant_id = ${tenant} and table_name = 'learning_objective' and row_id = ${A} and staff_id is not null`;
  expect(log.n, "the change is in the history under a person").toBeGreaterThan(0);
});

test("2. adding a grade shows the objective under that grade, in the same subject and unit; removing it takes it out", async ({ page }) => {
  await openEdit(page, B);
  await page.locator("#oe-add").selectOption("G1");
  await page.getByRole("button", { name: "Add grade" }).click();
  await expect(page.locator('[data-grades] [data-grade="G1"]')).toBeVisible();
  await page.goto(unitUrl("G1"));
  await expect(leaf(page, B)).toBeVisible(); // under Grade 1 now
  await page.goto(unitUrl(HOME));
  await expect(leaf(page, B), "and still under its home grade").toBeVisible();
  const [grades] = await sql<{ band: string; also: string[] }[]>`select band, also_bands as also from learning_objective where tenant_id = ${tenant} and code = ${B}`;
  expect(grades).toEqual({ band: HOME, also: ["G1"] });
  await openEdit(page, B);
  await page.locator('[data-grade="G1"]').getByRole("button", { name: /Take out of/ }).click();
  await expect(page.locator('[data-grades] [data-grade="G1"]')).toHaveCount(0); // the removal has been saved
  await page.goto(unitUrl("G1"));
  await expect(leaf(page, B)).toHaveCount(0);
  await page.goto(unitUrl(HOME));
  await expect(leaf(page, B), "the objective was never deleted").toBeVisible();
});

test("3. an objective with one grade offers no Remove, so it always stays in a grade", async ({ page }) => {
  await openEdit(page, B);
  await expect(page.locator("[data-grades] [data-grade]")).toHaveCount(1);
  await expect(page.locator("[data-grades]").getByRole("button", { name: /Take out of/ })).toHaveCount(0);
});

test("4. a person who may only look sees the panel with no Edit", async ({ page }) => {
  await gate(sql, "look");
  try {
    await page.goto(unitUrl(HOME));
    await leaf(page, A).click();
    await expect(page.locator('[data-panel="open"]')).toBeVisible();
    await expect(page.getByRole("tab", { name: "Edit" })).toHaveCount(0);
    await expect(page.locator("[data-objective-edit]")).toHaveCount(0);
  } finally {
    await gate(sql, "reviewer");
  }
});

test("5. at 400 px the panel is a sheet, editing works and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await openEdit(page, A);
  await page.locator("#oe-title").fill("U108 objective A, on a phone");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#oe-title")).toHaveValue("U108 objective A, on a phone");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const b of await page.locator("[data-objective-edit] button, [data-objective-edit] select, [data-objective-edit] input:not([type=hidden])").all()) {
    const box = await b.boundingBox();
    expect(box && box.height >= 44, "each control is at least 44 px tall").toBe(true);
  }
  await tree(page).waitFor({ state: "attached" });
});
