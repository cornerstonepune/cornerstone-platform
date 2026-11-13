/**
 * U87 — Assessments as the page charter's B6 draws it (docs/frontend/page-charter.md §B6, and Part C's rows "An assessment / a child's
 * paper → become B6's panel" and "Upload papers → delete, inside B6"): a Board of four lanes of compact cards, Make an assessment as the one
 * primary action, the one filter row, and on the right the assessment's panel (Copies · Upload · Check · Results) or, with nothing chosen,
 * three numbers. One test per charter line. Uploading a file itself is proved on the panel's Upload tab by u44-upload-on-marking.
 *
 * A class of the spec's own (U87-BOARD, Grade 2), its children named from tests/fake-names.ts: a class assessment with one copy with the
 * children, one read with an answer to judge (its scan read two days ago, so its check is overdue) and one signed off; another week's
 * copy with the children; a home assessment waiting for approval; and a practice paper signed off.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_FIRST_NAMES } from "./fake-names";
import { aClass, aReadPaper } from "./rows";
import { isoWeek } from "../lib/week";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U87-BOARD";
const THIS = isoWeek();
const BOARD = `/children/assessments?class=${SECTION}`;
const [ALBA, BEA, CAL, DOT] = FAKE_FIRST_NAMES;
const QR = { alba: "CS87A001", bea: "CS87A002", cal: "CS87A003", dot: "CS87A004", home: "CS87A005", practice: "CS87A006" };
let kids: Record<string, string> = {};

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G2", [ALBA, BEA, CAL, DOT]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids[ALBA]}`;
  const ws = await sql<{ id: string; item_ids: string[] }[]>`
    select id, item_ids from sheet_template
    where source = 'library' and retired_at is null and band = 'G2' and array_length(item_ids, 1) >= 2
      and skill_set_code = (select skill_set_code from sheet_template where source = 'library' and retired_at is null and band = 'G2'
                            and array_length(item_ids, 1) >= 2 order by skill_set_code limit 1)
    order by code limit 2`;
  if (ws.length < 2) throw new Error(`needs two library worksheets of one Grade 2 skill set; the database has ${ws.length}`);
  const paper = (qr: string, child: string, week: string, kind: string, status: string) => sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at)
    select ${tenant}, ${qr}, ${ws[0].id}, ${child}, to_date(${week}, 'IYYY-"W"IW'), ${SECTION}, ${kind}, ${status},
           ${status === "new" ? null : "u87"}, ${status === "new" ? null : sql`now()`}
    where not exists (select 1 from sheet_instance where qr_code = ${qr})`;
  await paper(QR.alba, kids[ALBA], THIS, "assessment", "printed");
  await paper(QR.bea, kids[BEA], THIS, "assessment", "printed");
  await paper(QR.cal, kids[CAL], THIS, "assessment", "printed");
  await paper(QR.dot, kids[DOT], "2026-W02", "assessment", "printed");
  await paper(QR.home, kids[DOT], THIS, "focus", "new");
  await paper(QR.practice, kids[CAL], THIS, "practice", "printed");
  await sql`update sheet_instance set print_status = 'new', approved_by = null, approved_at = null where qr_code = ${QR.home}`;
  const items = ws[0].item_ids.slice(0, 2);
  // Bea's copy read, one answer waiting for a person, its scan two days old: a check overdue
  const bea = await aReadPaper(sql, { qr: QR.bea, child: kids[BEA], template: ws[0].id, items, reads: [{ status: "correct", key: true }, { status: "needs_teacher", read: "7", why: "under the confidence floor" }] });
  await sql`update capture set created_at = now() - interval '2 days' where id = ${bea.capture}`;
  // Cal's class copy and practice paper read and signed off (once: evidence is append-only)
  for (const qr of [QR.cal, QR.practice]) {
    const [done] = await sql`select 1 from sheet_instance si join capture c on c.sheet_instance_id = si.id and c.superseded_by is null
                             join item_result r on r.capture_id = c.id and r.state = 'confirmed' where si.qr_code = ${qr} limit 1`;
    if (done) continue;
    const p = await aReadPaper(sql, { qr, child: kids[CAL], template: ws[0].id, items, reads: [{ status: "correct", key: true }, { status: "correct", key: true }] });
    await sql`select confirm_results(${kids[CAL]}::uuid, 'e2e@cornerstone.test', ${p.capture}::uuid)`;
  }
});
test.afterAll(async () => {
  // nothing left waiting on Today for the specs after this one
  await sql`update sheet_instance set print_status = 'printed', approved_by = coalesce(approved_by, 'u87'), approved_at = coalesce(approved_at, now())
            where section = ${SECTION} and print_status = 'new'`;
  await sql.end();
});

const lane = (page: Page, key: string) => page.locator(`[data-lane="${key}"]`);
/** A lane's card (the card and its next-action button): each lane of the class holds one. */
const cardOf = (page: Page, laneKey: string) => lane(page, laneKey).locator("li").first();
const panel = (page: Page) => page.locator("[data-block=DetailPanel]");

test("B6 primary action: Make an assessment sits under the title and opens the four ways in", async ({ page }) => {
  await page.goto(BOARD);
  const action = page.locator("main [data-ux=action]").first();
  await expect(action.locator("summary")).toHaveText("Make an assessment");
  await action.locator("summary").click();
  const ways = page.getByRole("region", { name: "Make an assessment" }).getByRole("button");
  await expect(ways).toHaveText([/For a class/, /For each child/, /For one child/, /A ready-made worksheet/]);
  await ways.first().click();
  await expect(page).toHaveURL(/make=class/);
});

test("B6 lanes: To approve and print · With the children · To read and check · Results in, each card in the lane of its next step", async ({ page }) => {
  await page.goto(BOARD);
  await expect(page.locator("[data-lane] h3")).toHaveText([/^To approve and print\s*\d+$/, /^With the children\s*\d+$/, /^To read and check\s*\d+$/, /^Results in\s*\d+$/]);
  await expect(lane(page, "approve").locator("[data-kcard]")).toHaveCount(1); // the home assessment waits for approval
  await expect(lane(page, "approve")).toContainText("Waits for approval");
  await expect(lane(page, "children").locator("[data-kcard]")).toHaveCount(1); // last term's copy, with the child
  await expect(lane(page, "check").locator("[data-kcard]")).toHaveCount(1); // this week's, an answer to judge
  await expect(lane(page, "results").locator("[data-kcard]")).toHaveCount(1); // the practice paper, signed off
  // a lane's count is its cards
  for (const key of ["approve", "children", "check", "results"]) await expect(lane(page, key).locator(".b-count")).toHaveText("1");
});

test("B6 compact cards: title is topic and class, one line date · n of m papers back, one status chip, one next-action button, no stage text repeated", async ({ page }) => {
  await page.goto(BOARD);
  const item = cardOf(page, "check");
  const c = item.locator("[data-kcard]");
  await expect(c.locator("b")).toHaveText(/ · Grade 2 · U87-BOARD$/);
  await expect(c.locator(".b-sub")).toHaveText(/^(\d{2}-[A-Z][a-z]{2}-\d{4}|week of .+) · 2 of 3 papers back$/);
  await expect(item.locator("[data-block=StatusChip]")).toHaveCount(1);
  await expect(item.locator("[data-block=StatusChip]")).toHaveText("1 answer to judge");
  const next = item.locator("[data-card-next]");
  await expect(next).toHaveCount(1);
  await expect(next).toHaveText("Check 1 answer");
  // the stage is said once, by the chip: never again in the line, and no "Next:" sentence
  const text = (await item.innerText()).replace(/\s+/g, " ");
  expect(text.match(/answer to judge/g)).toHaveLength(1);
  expect(text).not.toContain("Next:");
  // the next action opens the panel at the tab of the step it is
  await next.click();
  await expect(page).toHaveURL(/open=assessment%3A[0-9a-f]{8}|open=assessment:[0-9a-f]{8}/);
  await expect(panel(page).getByRole("tab", { name: "Check" })).toHaveAttribute("aria-selected", "true");
});

test("B6 filters: one row of Class · Subject · Week, and More filters for the rest", async ({ page }) => {
  await page.goto("/children/assessments");
  const bar = page.locator("[data-filterbar]");
  const inRow = bar.locator("form > label select[data-filter]");
  await expect(inRow).toHaveCount(3);
  await expect(bar.locator("form > label")).toHaveText([/^Class/, /^Subject/, /^Week/, /.*/]);
  await expect(bar.locator("[data-more-filters] summary")).toHaveText(/^More filters/);
  await bar.locator("[data-more-filters] summary").click();
  await expect(bar.locator("[data-more-filters] select")).toHaveCount(3); // Topic, Kind, Stage
});

test("B6 right side, card chosen: the assessment panel with Copies · Upload · Check · Results", async ({ page }) => {
  await page.goto(BOARD);
  const c = cardOf(page, "check").locator("[data-kcard]");
  await c.click();
  await expect(page).toHaveURL(/open=assessment/);
  const p = panel(page);
  await expect(p).toHaveAttribute("data-panel", "open");
  await expect(p.getByRole("tab")).toHaveText(["Copies", "Upload", "Check", "Results"]);
  await expect(c).toHaveAttribute("aria-current", "true");
  // Copies: each child's copy, by Sr. No., with its state
  const copies = p.locator("[data-copies] [data-copy]");
  await expect(copies).toHaveCount(3);
  await expect(p.locator('[data-copies] [data-copy="1"]')).toHaveAttribute("data-group", "children");
  await expect(p.locator('[data-copies] [data-copy="2"]')).toHaveAttribute("data-group", "judge");
  await expect(p.locator('[data-copies] [data-copy="3"]')).toHaveAttribute("data-group", "results");
  await expect(p.locator('[data-copies] [data-copy="2"] [data-block=StatusChip]')).toHaveText("for you to judge");
  // Upload: the drop zone and the Drive link
  await p.getByRole("tab", { name: "Upload" }).click();
  await expect(p.getByLabel("Choose scans")).toHaveCount(1);
  await expect(p.getByLabel("Link to the scan on Google Drive")).toBeVisible();
  // Check: the answers waiting, each paper one press away
  await p.getByRole("tab", { name: "Check" }).click();
  await expect(p.locator('[data-check] [data-copy="2"]')).toContainText("1 answer to judge");
  await expect(p.locator("[data-check] [data-copy]")).toHaveCount(1);
  // Results: the copies signed off, with their scores
  await p.getByRole("tab", { name: "Results" }).click();
  await expect(p.locator('[data-results] [data-copy="3"]')).toContainText("2 of 2");
  await expect(p.locator("[data-results-total]")).toHaveText("1 of 3 papers signed off · 2 of 2 answers right");
  // and no child's name: the copies are said by Sr. No.
  for (const n of [ALBA, BEA, CAL, DOT]) await expect(p).not.toContainText(n);
  // closing it gives back the three numbers, the card where it was
  await p.locator("[data-panel-close]").click();
  await expect(panel(page)).toHaveAttribute("data-panel", "summary");
});

test("B6 Upload tab: the old page's server action, here: a link that is not Google Drive is refused in words and the tab stays open", async ({ page }) => {
  await page.goto(BOARD);
  await cardOf(page, "children").locator("[data-card-next]").click(); // Upload: the copy is with the children
  const p = panel(page);
  await expect(p.getByRole("tab", { name: "Upload" })).toHaveAttribute("aria-selected", "true");
  await p.getByLabel("Link to the scan on Google Drive").fill("https://example.com/a-scan.pdf");
  await p.getByRole("button", { name: "Read it" }).click();
  await expect(page).toHaveURL(/read=not-a-link/);
  await expect(page).toHaveURL(/tab=upload/);
  await expect(panel(page)).toContainText("Paste the link to the scan on Google Drive");
  await expect(panel(page).getByRole("tab", { name: "Upload" })).toHaveAttribute("aria-selected", "true");
});

test("Part C: an assessment's and a child's paper's full-page addresses keep working, as the panel opened full page", async ({ page }) => {
  await page.goto(BOARD);
  await cardOf(page, "check").locator("[data-kcard]").click();
  const full = panel(page).locator("[data-panel-full]");
  await expect(full).toHaveText("Open full page");
  const href = (await full.getAttribute("href"))!;
  expect(href).toMatch(/^\/children\/assessments\/assessment~U87-BOARD~/);
  const paper = (await panel(page).locator('[data-copies] [data-copy="2"] a').first().getAttribute("href"))!;
  expect(paper).toBe(`${href}/2`);
  await page.goto(href);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Each child’s copy" })).toBeVisible();
  await page.goto(paper);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check the answers");
});

test("B6 right side, nothing chosen: papers waiting to check · answers to judge · overdue checks", async ({ page }) => {
  await page.goto(BOARD);
  const p = panel(page);
  await expect(p).toHaveAttribute("data-panel", "summary");
  const n = async (id: string) => Number((await p.locator(`[data-stat="${id}"] .b-stat-n`).innerText()).replace(/,/g, ""));
  await expect(p.locator("[data-stat]")).toHaveCount(3);
  // the class's own rows: Bea's copy is the one paper in and not yet signed off, with one answer to judge
  expect(await n("to-check")).toBe(1);
  expect(await n("to-judge")).toBe(1);
  await expect(p.locator('[data-stat="to-judge"]')).toHaveAttribute("href", /\/children\/assessments\/assessment~U87-BOARD~.+\/2$/);
  // overdue checks: every paper with an answer waiting longer than the school's setting, as Across classes counts them
  const [{ n: overdue }] = await sql<{ n: number }[]>`
    select count(distinct k.id)::int as n from item_result r join capture k on k.id = r.capture_id and k.superseded_by is null
    join sheet_instance si on si.id = k.sheet_instance_id left join child_now ch on ch.id = si.child_id
    where r.status in ('unreadable', 'needs_teacher') and coalesce(si.section, ch.section) is not null
      and k.created_at < now() - make_interval(hours => (select value::numeric from config where key = 'across.check_overdue_hours')::int)`;
  expect(overdue).toBeGreaterThan(0); // Bea's, read two days ago
  expect(await n("overdue")).toBe(overdue);
  await expect(p.locator('[data-stat="overdue"]')).toHaveAttribute("href", "/across");
});

test("Part C: the Upload papers page is gone: its address answers 308 to the board, and the menu has no Upload papers", async ({ page, request }) => {
  const res = await request.get("/capture", { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers().location).toBe("/children/assessments");
  await page.goto("/capture");
  await expect(page).toHaveURL(/\/children\/assessments$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Assessments");
  await expect(page.locator("[data-sidebar]").getByRole("link", { name: "Upload papers" })).toHaveCount(0);
  await expect(page.locator("[data-sidebar]").getByRole("link", { name: "Assessments", exact: true })).toHaveCount(1);
});

