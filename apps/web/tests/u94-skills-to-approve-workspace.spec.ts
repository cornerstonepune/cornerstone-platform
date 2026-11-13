/**
 * U94 — Skills to approve as the page charter's Part C line draws it: "Skills to approve: keep, Workspace; one skill at a time on the
 * right" (docs/frontend/page-charter.md, with Part A's Workspace and detail panel). The skills waiting on the left; one skill open on the
 * right with its levels and its own Approve, as today (one skill a press, never several); an approval comes back with the next skill open;
 * the skill's own page is the panel opened full page. The four drafts are the repository's seeded skills; every other skill is approved
 * for the test and everything is put back after, as u23 does.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { signedInAs } from "./inventory-fixtures";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
// in the list's order (subject, grade, topic, name): Grade 1's addition, Grade 2's addition and subtraction, Grade 3's division
const DRAFTS = ["ADD.1D1D", "ADD.2D2D", "SUB.2D2D", "DIV.3D1D"];

test.afterAll(async () => {
  await sql.end();
});

async function onlyThese(run: () => Promise<void>) {
  const before = await sql<{ code: string; status: string; ratified_by: string | null }[]>`select code, status, ratified_by from skill order by code`;
  const approved = await sql<{ code: string; level_approved: unknown }[]>`select code, level_approved from skill where code = any(${DRAFTS})`;
  try {
    await sql`update skill set status = 'ratified', ratified_by = 'someone earlier'`;
    await sql`update skill set status = 'draft', ratified_by = null where code = any(${DRAFTS})`;
    await run();
  } finally {
    for (const b of before) await sql`update skill set status = ${b.status}, ratified_by = ${b.ratified_by} where code = ${b.code}`;
    for (const a of approved) await sql`update skill set level_approved = ${sql.json((a.level_approved ?? {}) as never)} where code = ${a.code}`;
  }
}

const panel = (page: Page) => page.locator("[data-block=DetailPanel]");
const nameOf = async (code: string) => (await sql<{ name: string }[]>`select name from skill where code = ${code}`)[0].name;

test("Skills to approve is a Workspace: the skills on the left with no Approve on a row, the summary on the right; Read the first skill opens one skill there", async ({ page }) => {
  await onlyThese(async () => {
    await page.goto("/setup/skills/approve", { waitUntil: "networkidle" });
    await expect(page.locator("main tbody tr[data-row]")).toHaveCount(DRAFTS.length);
    await expect(page.locator("main table [data-approve]")).toHaveCount(0);
    await expect(panel(page)).toHaveAttribute("data-panel", "summary");
    await expect(panel(page).locator("[data-stat=shown] .b-stat-n")).toHaveText(String(DRAFTS.length));
    const first = page.locator("[data-ux=action]").getByRole("link", { name: "Read the first skill" });
    await first.click();
    await expect(panel(page)).toHaveAttribute("data-panel", "open");
    await expect(page).toHaveURL(/[?&]open=skill%3A/);
    // one skill at a time: one panel, one Approve, which is now the page's one main action
    await expect(panel(page)).toHaveCount(1);
    await expect(page.locator("[data-approve]")).toHaveCount(1);
    await expect(page.locator("[data-ux=action]")).toHaveCount(1);
    await expect(panel(page).locator("[data-ux=action][data-approve]")).toBeVisible();
  });
});

test("a skill chosen shows its levels and what it is; Escape closes it; its full page is the skill's own page", async ({ page }) => {
  await onlyThese(async () => {
    const name = await nameOf("ADD.2D2D");
    await page.goto("/setup/skills/approve", { waitUntil: "networkidle" });
    const link = page.locator('tr[data-row="ADD.2D2D"] [data-row-link]');
    await expect(link).toHaveText(name);
    await link.click();
    await expect(panel(page).getByRole("heading", { level: 2 })).toHaveText(name);
    await expect(panel(page).getByRole("tab")).toHaveText(["Levels", "About"]);
    await expect(panel(page).locator("[data-levels]").getByText("Easy", { exact: true })).toBeVisible();
    await panel(page).getByRole("tab", { name: "About" }).click();
    await expect(panel(page).locator("[data-tab-body=about]")).toContainText("Grade 2");
    // the panel's tab never names the page's own second list (tab=levels is Levels to review)
    await expect(page).toHaveURL(/[?&]tab=about/);
    await expect(panel(page).getByRole("link", { name: "Open full page" })).toHaveAttribute("href", "/setup/skill-sets/ADD.2D2D");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveAttribute("data-panel", "summary");
    await expect(link).toBeFocused();
  });
});

test("Approve in the panel approves that one skill as today, and the next skill waiting opens in its place", async ({ page }) => {
  await onlyThese(async () => {
    const [add, sub] = [await nameOf("ADD.2D2D"), await nameOf("SUB.2D2D")];
    await page.goto("/setup/skills/approve?grade=G2&open=skill:ADD.2D2D", { waitUntil: "networkidle" });
    await expect(page.getByTestId("stage")).toHaveText("4 waiting");
    await panel(page).getByRole("button", { name: `Approve ${add}`, exact: true }).click();
    await expect(page).toHaveURL(/[?&]approved=1(&|$)/);
    await expect(page.getByTestId("stage")).toHaveText("3 waiting");
    // only that skill: the other three still wait, and the next of Grade 2 is open, the choices kept
    const left = await sql<{ code: string }[]>`select code from skill where status = 'draft' and code = any(${DRAFTS}) order by code`;
    expect(left.map((r) => r.code)).toEqual(["ADD.1D1D", "DIV.3D1D", "SUB.2D2D"]);
    await expect(page).toHaveURL(/[?&]grade=G2(&|$)/);
    await expect(panel(page)).toHaveAttribute("data-open", "skill:SUB.2D2D");
    await panel(page).getByRole("button", { name: `Approve ${sub}`, exact: true }).click();
    await expect(page.getByTestId("stage")).toHaveText("2 waiting");
    // none of Grade 2 left: the list is back with nothing open
    await expect(panel(page)).toHaveAttribute("data-panel", "summary");
  });
});

test("an educator who may not approve reads a skill in the panel with no Approve", async ({ browser }) => {
  await onlyThese(async () => {
    const context = await signedInAs(browser, "educator", { width: 1440, height: 900 });
    const page = await context.newPage();
    await page.goto("/setup/skills/approve?open=skill:ADD.2D2D", { waitUntil: "networkidle" });
    const open = page.locator("[data-block=DetailPanel][data-panel=open]");
    if (await open.count()) {
      await expect(open.getByRole("tab")).toHaveText(["Levels", "About"]);
      await expect(page.locator("[data-approve]")).toHaveCount(0);
    } else await expect(page.locator("[data-approve]")).toHaveCount(0); // a skill outside the educator's classes is not in their list at all
    await context.close();
  });
});
