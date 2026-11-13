/**
 * U81 (UI-4b, PR 4) — the Assessments list at 1440 px (old spec: u63-assessments-page, goals/asm_assessments_page.yaml), the facts that outlive the old
 * page's layout, said of the list that took its place: its Table view, the Reading view, the next step of a row, a home assessment's approval, ten to a
 * page. (The old layout's own assertions — two blocks side by side, a tab strip, the seven step columns, a row that unfolds in place — went with the page;
 * the screens' controls are held by the inventory, tests/u70-inventory.spec.ts, and the names, tiles, steps and rename by u73 and u75.) Nimish, 24 Oct 2026: "This assessment page can be
 * much better formatted... two nice blocks side by side... a very proper list of the last 5, last 7 assessments... we
 * should ideally have the ability to name the assessment. We should not use these file names... Then we have this 4.
 * There is no sequence of anything... There is nothing hidden from the system."
 *
 * A class of the test's own: a class assessment (one child's paper printed, one not printed, one read with an answer
 * waiting for a person) and a home assessment waiting for approval; one file read that belongs to the class assessment
 * and one that belongs to none. Evidence is append-only, so the rows are kept, as the other specs' are.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { aClass, aReadPaper } from "./rows";
import { isoWeek } from "../lib/week";

test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U81-CLASS";
const THIS = isoWeek();
const QR = { asha: "CS81A001", bina: "CS81A002", chetan: "CS81A003", home: "CS81A004" };
let skillName = "";

test.beforeAll(async () => {
  const kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina", "Chetan", "Dev"]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids.Asha}`;
  const ws = await sql<{ id: string; item_ids: string[]; skill: string }[]>`
    select id, item_ids, skill_set_code as skill from sheet_template
    where source = 'library' and retired_at is null and band = 'G2'
      and skill_set_code = (select skill_set_code from sheet_template where source = 'library' and retired_at is null
                            and band = 'G2' and difficulty = 'Hard' order by skill_set_code limit 1)
      and difficulty in ('Medium', 'Hard')
    order by difficulty = 'Hard' desc, code limit 4`;
  if (ws.length < 4) throw new Error(`needs four library worksheets of one Grade 2 skill set; the database has ${ws.length}`);
  [{ name: skillName }] = await sql<{ name: string }[]>`select name from skill where code = ${ws[0].skill}`;
  const paper = (qr: string, w: string, child: string, status: string, kind: string) => sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at)
    select ${tenant}, ${qr}, ${w}, ${child}, to_date(${THIS}, 'IYYY-"W"IW'), ${SECTION}, ${kind}, ${status},
           ${status === "new" ? null : "u81"}, ${status === "new" ? null : sql`now()`}
    where not exists (select 1 from sheet_instance where qr_code = ${qr})`;
  await paper(QR.asha, ws[0].id, kids.Asha, "printed", "assessment");
  await paper(QR.bina, ws[1].id, kids.Bina, "printed", "assessment");
  await paper(QR.chetan, ws[2].id, kids.Chetan, "new", "assessment");
  await paper(QR.home, ws[3].id, kids.Dev, "new", "focus");
  await aReadPaper(sql, {
    qr: QR.bina,
    child: kids.Bina,
    template: ws[1].id,
    items: ws[1].item_ids.slice(0, 2),
    reads: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }],
    file: "IMG_U81.pdf",
  });
  // one file whose codes are this assessment's, one whose codes belong to no paper the school printed
  await sql`delete from flow_run where flow = 'read-scan' and (trigger like '%IMG_U81.pdf' or trigger like '%stranger.pdf')`;
  for (const [file, code] of [["IMG_U81.pdf", QR.bina], ["stranger.pdf", "CSABCDEF"]] as const) {
    await sql`
      insert into flow_run (tenant_id, flow, trigger, status, finished_at, result)
      values (${tenant}, 'read-scan', ${`upload: ${file}`}, 'ok', now(), ${sql.json({ pages: 1, copies: [{ copy: 1, pages: [1], code, child_id: null, answers: 2 }] })})`;
  }
});
test.afterAll(async () => {
  // leave nothing waiting on Today for the specs that run after this one, and no file in the reading list
  await sql`update sheet_instance set print_status = 'printed', approved_by = coalesce(approved_by, 'u81'), approved_at = coalesce(approved_at, now())
            where section in (${SECTION}, 'U81-LONG') and print_status = 'new'`;
  await sql`delete from flow_run where flow = 'read-scan' and (trigger like '%IMG_U81.pdf' or trigger like '%stranger.pdf')`;
  await sql.end();
});


const LIST = "/children/assessments";
const row = (page: Page, key = `assessment~${SECTION}~${THIS}~`) => page.locator(`tr[data-assessment^='${key}']`);
const table = (query: string) => `${LIST}?${query}&view=table`;

test("an assessment is named from its sheet, never from its file; the file is told apart in the Reading view", async ({ page }) => {
  await page.goto(table(`class=${SECTION}`));
  const r = row(page);
  await expect(r).toHaveCount(1);
  const name = r.locator("a[data-assessment-row]");
  await expect(name).toHaveText(new RegExp(`^[^·]+ · ${skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: · (?:Easy|Medium|Hard|Advance))? · Class assessment · Grade 2 · ${SECTION} · \\d{2}-[A-Z][a-z]{2}-\\d{4}$`));
  await expect(name).not.toContainText(/\.pdf|IMG_/);
  // the file is a line of the Reading view, against the assessment its codes belong to
  await page.goto(`${LIST}?view=reading`);
  const files = page.getByRole("region", { name: "Read a scan" });
  await expect(files.locator("tr", { hasText: "IMG_U81.pdf" }).first()).toBeVisible();
});

test("a file that belongs to no assessment says so", async ({ page }) => {
  await page.goto(`${LIST}?view=reading`);
  const stranger = page.getByRole("region", { name: "Read a scan" }).locator("tr", { hasText: "stranger.pdf" }).first();
  await expect(stranger).toBeVisible();
  await expect(stranger.locator("[data-unmatched]")).toHaveText("Not matched to an assessment");
  await expect(stranger.locator("[data-unmatched]")).toHaveClass(/terracotta/);
});

test("the row's one action opens the next item: an answer waiting for a person comes before printing and uploading", async ({ page }) => {
  await page.goto(table(`class=${SECTION}&kind=assessment`));
  const next = row(page).locator("[data-assessment-next]");
  await expect(next).toHaveCount(1);
  await next.click();
  // the paper with the answer to judge, on the paper screen
  await expect(page).toHaveURL(/\/children\/assessments\/[^/]+\/\d+/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check the answers");
});

test("with nothing waiting on a person, the row says what comes next: print, then upload", async ({ page }) => {
  const [t] = await sql<{ tenant_id: string; sheet_template_id: string; child_id: string }[]>`
    select tenant_id, sheet_template_id, child_id from sheet_instance where qr_code = ${QR.asha}`;
  const made = async (qr: string, wk: string, status: string) => sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at)
    select ${t.tenant_id}, ${qr}, ${t.sheet_template_id}, ${t.child_id}, to_date(${wk}, 'IYYY-"W"IW'), ${SECTION}, 'assessment', ${status},
           ${status === "new" ? null : "u81"}, ${status === "new" ? null : sql`now()`}
    where not exists (select 1 from sheet_instance where qr_code = ${qr})`;
  await made("CS81A006", "2026-W03", "new");
  await made("CS81A005", "2026-W02", "printed");
  // an earlier run's afterAll printed every copy waiting: this one waits to be printed again
  await sql`update sheet_instance set print_status = 'new', approved_by = null, approved_at = null where qr_code = 'CS81A006'`;
  await page.goto(table(`class=${SECTION}&week=2026-W03`));
  await expect(page.locator("[data-assessment-next]").first()).toHaveText(/Print/);
  await page.goto(table(`class=${SECTION}&week=2026-W02`));
  await expect(page.locator("[data-assessment-next]").first()).toHaveText(/Upload/);
});

test("a home assessment waits for approval, its row has no Approve for all, and a class assessment has no approval step", async ({ page }) => {
  await sql`update sheet_instance set print_status = 'new', approved_by = null, approved_at = null where qr_code = ${QR.home}`;
  await page.goto(table(`class=${SECTION}&kind=focus`));
  const home = row(page, "focus~");
  await expect(home).toHaveCount(1);
  await expect(home).toContainText("Waits for approval");
  await expect(page.getByText(/approve all/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /approve all/i })).toHaveCount(0);
  await page.goto(table(`class=${SECTION}&kind=assessment`));
  await expect(row(page)).not.toContainText("Waits for approval");
});

test("the list is ten assessments to a page, newest first", async ({ page }) => {
  const long = "U81-LONG";
  const kids = await aClass(sql, long, "G2", ["Esha"]);
  const [t] = await sql<{ tenant_id: string; sheet_template_id: string }[]>`select tenant_id, sheet_template_id from sheet_instance where qr_code = ${QR.asha}`;
  for (let i = 0; i < 12; i++) {
    const wk = `2026-W${String(10 + i).padStart(2, "0")}`;
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at, created_at)
      select ${t.tenant_id}, ${`CS81B${String(i).padStart(3, "0")}`}, ${t.sheet_template_id}, ${kids.Esha}, to_date(${wk}, 'IYYY-"W"IW'), ${long}, 'assessment', 'printed', 'u81', now(),
             now() - ${(12 - i) * 3} * interval '1 day'
      where not exists (select 1 from sheet_instance where qr_code = ${`CS81B${String(i).padStart(3, "0")}`})`;
  }
  await page.goto(table(`class=${long}`));
  const rows = page.locator("tr[data-assessment]");
  await expect(rows).toHaveCount(10);
  // newest first: the week made last is at the top
  await expect(rows.first()).toHaveAttribute("data-assessment", new RegExp("2026-W21~"));
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("link", { name: /Later/ }).click();
  await expect(rows).toHaveCount(2);
});

// Page charter B6: the two blocks above the list are gone. Make an assessment is the page's one primary action, above the list, the four
// ways behind it; reading a scan is an assessment's Upload tab: one drop zone, the Drive link and one button.
test("Make an assessment sits above the list with the four ways behind it, and an assessment's Upload tab reads a scan", async ({ page }) => {
  await page.goto(`${LIST}?view=table&class=${SECTION}`);
  const make = await page.locator("[data-make]").boundingBox();
  const list = await page.locator("table").first().boundingBox();
  expect(make && list).toBeTruthy();
  expect(list!.y, "the list is below it").toBeGreaterThan(make!.y + make!.height - 2);
  await page.locator("[data-make-open]").click();
  for (const w of ["For a class", "For each child", "For one child", "A ready-made worksheet"]) await expect(page.getByRole("region", { name: "Make an assessment" }).getByRole("button", { name: w })).toBeVisible();
  await page.goto(`${LIST}?class=${SECTION}`);
  await page.locator("[data-kcard]").first().click();
  const panel = page.locator("[data-block=DetailPanel]");
  await panel.getByRole("tab", { name: "Upload" }).click();
  const rb = panel.getByRole("region", { name: "Upload papers" });
  await expect(rb.getByLabel("Choose scans")).toHaveCount(1);
  await expect(rb.getByLabel("Link to the scan on Google Drive")).toBeVisible();
  await expect(rb.getByRole("button", { name: "Read it" })).toBeVisible();
});

