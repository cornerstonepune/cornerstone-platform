/**
 * U23 — Approving the skills, as a table to work through (goals/ui6a-approve-filtered.yaml). Nimish, 2026-10-12, with a
 * screenshot of the page: "also ths page needs to have proper filters and all; no page should have such laundary lists
 * like stuff". On Skills to approve (Setup) each waiting skill is one row with its levels; grade, topic and taught narrow
 * the rows; each row's Approve approves that skill and nothing else. Every change is put back after.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { TEST_STAFF } from "./global-setup";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const DRAFTS = ["ADD.1D1D", "ADD.2D2D", "SUB.2D2D", "DIV.3D1D"];

test.afterAll(async () => {
  await sql.end();
});

// every skill approved but these, the mistake table as it was; put back after
async function onlyThese(run: () => Promise<void>) {
  const before = await sql<{ code: string; status: string; ratified_by: string | null }[]>`
    select code, status, ratified_by from skill order by code`;
  const [table] = await sql<{ value: unknown }[]>`select value from config where key = 'skills.charges_by_kind.approved'`;
  try {
    await sql`update skill set status = 'ratified', ratified_by = 'someone earlier'`;
    await sql`update skill set status = 'draft', ratified_by = null where code = any(${DRAFTS})`;
    await run();
  } finally {
    for (const b of before) {
      await sql`update skill set status = ${b.status}, ratified_by = ${b.ratified_by} where code = ${b.code}`;
    }
    await sql`update config set value = ${sql.json((table?.value ?? {}) as never)} where key = 'skills.charges_by_kind.approved'`;
  }
}

// one table a subject, each named "Skills waiting for approval · <subject>": the rows are every table's
const rows = (page: Page) => page.getByRole("table", { name: /^Skills waiting for approval/ }).locator("tbody tr");
// a filter is a dropdown named by its label (its own label holds its options' words too, so it is found by its role);
// choosing one shows the result at once (components/filter-bar.tsx)
const filter = (page: Page, name: string) => page.locator("[data-filterbar]").getByRole("combobox", { name, exact: true });
// the rows the page shows once it has loaded: the count is waited for, then each row's skill read
async function expectRows(page: Page, codes: string[]) {
  await expect(rows(page)).toHaveCount(codes.length);
  const shown = await rows(page).evaluateAll((trs) => trs.map((tr) => tr.getAttribute("data-row")));
  expect(shown.sort()).toEqual([...codes].sort());
}

test("each waiting skill is one row, and its levels are read in the panel on the right", async ({ page }) => {
  await onlyThese(async () => {
    await page.goto("/setup/skills/approve");
    await expectRows(page, DRAFTS);
    // no skill is a card of its own any more
    const [{ name }] = await sql<{ name: string }[]>`select name from skill where code = 'ADD.2D2D'`;
    await expect(page.getByRole("region", { name, exact: true })).toHaveCount(0);
    const row = rows(page).and(page.locator('[data-row="ADD.2D2D"]'));
    await expect(row.getByRole("cell").first()).toHaveText(name);
    await expect(row).toContainText("Grade 2");
    // the skill opens on the right with its levels and its own Approve (page charter Part C: one skill at a time)
    await row.getByRole("link", { name, exact: true }).click();
    const panel = page.locator("[data-block=DetailPanel]");
    await expect(panel.locator("[data-levels]").getByText("Easy", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: `Approve ${name}`, exact: true })).toBeVisible();
    // the panel opened full page is the skill's own page, where its description and each level's sentence are changed
    await expect(panel.getByRole("link", { name: "Open full page" })).toHaveAttribute("href", "/setup/skill-sets/ADD.2D2D");
    await page.goto("/setup/skill-sets/ADD.2D2D");
    await expect(page.getByRole("link", { name: "Change the description and each level’s sentence" })).toHaveAttribute("href", "/skill-sets/ADD.2D2D/edit");
  });
});

test("a grade and a topic narrow the rows, and approving one approves only its row", async ({ page }) => {
  await onlyThese(async () => {
    const [{ value: tableBefore }] = await sql<{ value: unknown }[]>`
      select value from config where key = 'skills.charges_by_kind.approved'`;
    const [{ name: add }] = await sql<{ name: string }[]>`select name from skill where code = 'ADD.2D2D'`;
    const [{ name: sub }] = await sql<{ name: string }[]>`select name from skill where code = 'SUB.2D2D'`;
    await page.goto("/setup/skills/approve");
    // every grade until one is chosen: all four; Grade 2 holds two of them
    await expect(filter(page, "Grade")).toHaveValue("");
    await expectRows(page, DRAFTS);
    await filter(page, "Grade").selectOption({ label: "Grade 2 (2)" });
    await expect(page).toHaveURL(/[?&]grade=G2(&|$)/);
    await expectRows(page, ["ADD.2D2D", "SUB.2D2D"]);

    // a topic, under every grade: only its skills
    await filter(page, "Grade").selectOption({ value: "" });
    await expect(page).not.toHaveURL(/[?&]grade=G2/);
    await expectRows(page, DRAFTS);
    await filter(page, "Topic").selectOption({ label: "Division (1)" });
    await expect(page).toHaveURL(/[?&]topic=DIV(&|$)/);
    await expectRows(page, ["DIV.3D1D"]);
    await filter(page, "Topic").selectOption({ value: "" });
    await expect(page).not.toHaveURL(/[?&]topic=DIV/);
    // a skill whose topic is not taught yet is the one the Taught choice keeps (Taught is behind More filters: page charter A4)
    await page.locator("[data-filterbar] details[data-more-filters] > summary").click();
    await expect(filter(page, "Taught")).toBeVisible();
    await filter(page, "Taught").selectOption({ label: "Not taught yet (1)" });
    await expect(page).toHaveURL(/[?&]taught=no(&|$)/);
    await expectRows(page, ["DIV.3D1D"]);

    // Grade 2's two, each approved on its own row (no button over both): the other two and the mistake table still wait
    await page.goto("/setup/skills/approve?grade=G2");
    await expectRows(page, ["ADD.2D2D", "SUB.2D2D"]);
    await expect(page.getByTestId("stage")).toHaveText("4 waiting");
    await expect(page.getByRole("button", { name: /Approve (all|these)/ })).toHaveCount(0);
    await page.locator('tr[data-row="ADD.2D2D"] [data-row-link]').click();
    await page.locator("[data-block=DetailPanel]").getByRole("button", { name: `Approve ${add}`, exact: true }).click();
    await expect(page).toHaveURL(/[?&]approved=1(&|$)/);
    await expect(page.getByTestId("stage")).toHaveText("3 waiting");
    await expectRows(page, ["SUB.2D2D"]);
    // the next of Grade 2 is open after the approval
    await page.locator("[data-block=DetailPanel]").getByRole("button", { name: `Approve ${sub}`, exact: true }).click();
    await expect(page.getByTestId("stage")).toHaveText("2 waiting");
    // Grade 2 has none left: its choice goes from the filter row, and the rows are the other grades' two that still wait
    await expect(filter(page, "Grade").locator("option", { hasText: /^Grade 2/ })).toHaveCount(0);
    await expectRows(page, ["ADD.1D1D", "DIV.3D1D"]);
    const after = await sql<{ code: string; status: string; ratified_by: string | null }[]>`
      select code, status, ratified_by from skill where code = any(${DRAFTS}) order by code`;
    expect(after).toEqual([
      { code: "ADD.1D1D", status: "draft", ratified_by: null },
      { code: "ADD.2D2D", status: "ratified", ratified_by: TEST_STAFF.name },
      { code: "DIV.3D1D", status: "draft", ratified_by: null },
      { code: "SUB.2D2D", status: "ratified", ratified_by: TEST_STAFF.name },
    ]);
    const [{ value: tableAfter }] = await sql<{ value: unknown }[]>`
      select value from config where key = 'skills.charges_by_kind.approved'`;
    expect(tableAfter, "approving some skills never approves the mistake table").toEqual(tableBefore);
  });
});
