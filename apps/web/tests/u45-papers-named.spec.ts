/**
 * U45 — A paper named by what it tests (goals/ux8b-papers-named.yaml). Nimish, 2026-10-21: "focus on the UI/UX first,
 * on whatever we have right now for math, making sure that every screen and every other representation is thought
 * through well: it's clear, it's accurate, clickability is fine."
 *
 * A Grade 2 class of the test's own, made once and kept (evidence is append-only): Asha's copy of a library worksheet on
 * 2-digit + 2-digit at Medium is read, one answer waiting for a person, and has no date; the class has a practice paper
 * this week, planned for Asha. The educator teaches the class. Every page an educator opens the paper from names it by
 * its skill and level, never by the worksheet's code.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { paperAt } from "./paper-screen";
import { aClass, aReadPaper, aPerson, forgetPerson } from "./rows";
import { isoWeek } from "../lib/week";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U45-MINE";
const THIS = isoWeek();
const QR = { read: "CS45A001", practice: "CS45A0P1" };
const NAME = "2-digit + 2-digit · Medium";
const EDUCATOR = { email: "u45-educator@cornerstone.test", name: "U45 Educator", role: "educator", classes: [SECTION] };
const PASSWORD = "u45-a-long-test-password";
let kids: Record<string, string>;
let sheet: string;
let paper: string; // the read paper's own screen under Assessments
let code: string;

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina"]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids.Asha}`;
  const [ws] = await sql<{ id: string; item_ids: string[]; code: string }[]>`
    select id, item_ids, code from sheet_template
    where source = 'library' and retired_at is null and skill_set_code = 'ADD.2D2D' and difficulty = 'Medium' order by code limit 1`;
  code = ws.code;
  ({ sheet } = await aReadPaper(sql, {
    qr: QR.read,
    child: kids.Asha,
    template: ws.id,
    items: ws.item_ids.slice(0, 2),
    reads: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }],
  }));
  paper = (await paperAt({ sheet }));
  await sql`delete from prescription where child_id = ${kids.Asha} and week = to_date(${THIS}, 'IYYY-"W"IW') and kind = 'practice'`;
  await sql`delete from sheet_instance where qr_code = ${QR.practice}`;
  const [{ id: practice }] = await sql<{ id: string }[]>`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status)
    values (${tenant}, ${QR.practice}, ${ws.id}, ${kids.Asha}, ${SECTION}, to_date(${THIS}, 'IYYY-"W"IW'), 'practice', 'new') returning id`;
  await sql`
    insert into prescription (tenant_id, child_id, week, kind, rule_fired, skill_set_code, difficulty, sheet_instance_id)
    values (${tenant}, ${kids.Asha}, to_date(${THIS}, 'IYYY-"W"IW'), 'practice', 'band_default', 'ADD.2D2D', 'Medium', ${practice})`;
  await aPerson(sql, { ...EDUCATOR, password: PASSWORD });
});
test.afterAll(async () => {
  await sql`delete from prescription where child_id = ${kids.Asha} and week = to_date(${THIS}, 'IYYY-"W"IW') and kind = 'practice'`;
  await sql`delete from sheet_instance where qr_code = ${QR.practice}`;
  await forgetPerson(sql, EDUCATOR.email);
  await sql.end();
});

async function asEducator(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  await page.goto("/login");
  await page.getByLabel("School email").fill(EDUCATOR.email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/today$/);
  return page;
}

test("a paper is named by what it tests on every page an educator opens it from", async ({ browser }) => {
  const page = await asEducator(browser);
  for (const path of [`/growth/${kids.Asha}`, `/worksheets/${QR.read}`, `/children/assessments?class=${SECTION}&week=${THIS}&kind=practice&view=table`]) {
    await page.goto(path);
    const main = page.locator("main");
    // the page itself first: a "not" passes at once on the loading screen
    await expect(main, path).toContainText(NAME);
    await expect(main, `${path} names the worksheet by its code`).not.toContainText(code);
  }
  // the assessment's own screen, reached from its paper's screen, is titled by what it tests too
  await page.goto(paper);
  await page.getByRole("complementary", { name: "Rail" }).getByRole("link", { name: "The assessment" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(NAME);
  await expect(page.locator("main")).not.toContainText(code);
  await page.context().close();
});

test("one skill has one name: the marking page's lanes are the skills every other page names", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto(paper);
  const lanes = page.getByRole("region", { name: "What this paper says, by skill" });
  await expect(lanes.getByRole("heading", { level: 3 })).toHaveText(["2-digit + 2-digit"]);
  await page.context().close();
});

test("a paper with no date says nothing of one", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto(paper);
  // the page itself first: a "not" passes at once on the loading screen
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check the answers");
  await expect(page.locator("main header")).not.toContainText(/Sat\s*—/);
  await expect(page.locator("main")).not.toContainText(/sat\s*—/i);
  await page.context().close();
});

test("a link is named as the page it opens, and that page's way back names where it goes", async ({ browser }) => {
  const page = await asEducator(browser);
  await page.goto(`/make/${SECTION}`);
  await page.getByRole("link", { name: "What the class did this week" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${SECTION} · what the class did this week`);
  await expect(page.getByRole("link", { name: `← ${SECTION} · home assessments` })).toBeVisible();
  await page.context().close();
});

test("a class's home assessments say why a child has none: every child is counted in one column", async ({ page }) => {
  // every class's list is the coordinator's: an educator of one class opens straight on it
  await page.goto(`/make?class=${SECTION}`);
  const row = page.getByRole("table", { name: "Home assessments this week" }).locator("tbody tr").filter({ hasText: SECTION });
  // a column of zeros is not drawn (docs/ux-rules.md, rule 4): a cell that is not there is none
  const n = async (k: string) => ((await row.locator(`[data-n="${k}"]`).count()) ? Number(await row.locator(`[data-n="${k}"]`).textContent()) : 0);
  const children = Number(await row.locator('td[data-label="Children"]').textContent());
  expect(children).toBe(2);
  expect((await n("proposed")) + (await n("approved")) + (await n("too-few"))).toBe(children);
});
