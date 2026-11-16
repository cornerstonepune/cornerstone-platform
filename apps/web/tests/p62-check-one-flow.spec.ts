/**
 * CP-62 — checking a paper in one flow (specs/CP-62/spec.md). Nimish, 16 Nov 2026: "I'm not able to understand how I navigate the page ... a way
 * to click the entire assessment and look at the page, zoom in and out. At question level, it should only open the snapshot of that question ...
 * Those red tags are very difficult." One test per "Done when" line. A class of the spec's own (CP62-PAPER, Grade 3): Alba's paper holds a right
 * answer, a wrong, a wrong with working, a blank and three for a person to judge; Bea's holds two to judge (for the keys).
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_FIRST_NAMES } from "./fake-names";
import { aClass, aReadPaper } from "./rows";
import { paperAt } from "./paper-screen";
import { isoWeek } from "../lib/week";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "CP62-PAPER";
const THIS = isoWeek();
const [ALBA, BEA] = FAKE_FIRST_NAMES;
const QR = { alba: "CS62A001", bea: "CS62A002" };
// each answer has a region of its own on the page (a region two answers share is not shown as either's)
const box = (i: number) => [0.1, +(0.05 + i * 0.12).toFixed(2), 0.6, +(0.15 + i * 0.12).toFixed(2)];
let kids: Record<string, string> = {};
let alba: { sheet: string; capture: string; results: string[] };
let bea: { sheet: string; capture: string; results: string[] };

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G3", [ALBA, BEA]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids[ALBA]}`;
  const [ws] = await sql<{ id: string; item_ids: string[] }[]>`
    select id, item_ids from sheet_template
    where source = 'library' and retired_at is null and band = 'G3' and array_length(item_ids, 1) >= 7 order by code limit 1`;
  if (!ws) throw new Error("needs a library worksheet of seven items or more for Grade 3");
  for (const [qr, who] of [[QR.alba, ALBA], [QR.bea, BEA]] as const) {
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at)
      select ${tenant}, ${qr}, ${ws.id}, ${kids[who]}, to_date(${THIS}, 'IYYY-"W"IW'), ${SECTION}, 'assessment', 'printed', 'cp62', now()
      where not exists (select 1 from sheet_instance where qr_code = ${qr})`;
  }
  const waits = (i: number) => ({ status: "needs_teacher", read: "7", why: "under the confidence floor", box: box(i), boxes: 1 }) as const;
  const by = "cp62";
  alba = await aReadPaper(sql, {
    qr: QR.alba, child: kids[ALBA], template: ws.id, items: ws.item_ids.slice(0, 7),
    reads: [
      { status: "correct", key: true, box: box(0), boxes: 1 },
      { status: "wrong", read: "9", checkedBy: by, box: box(1), boxes: 1 },
      { status: "wrong", read: "8", checkedBy: by, box: box(2), boxes: 1 },
      { status: "blank", checkedBy: by, box: box(3), boxes: 1 },
      waits(4), waits(5), waits(6),
    ],
  });
  await sql`update item_result set working_shown = 'partial' where id = ${alba.results[2]}`;
  bea = await aReadPaper(sql, { qr: QR.bea, child: kids[BEA], template: ws.id, items: ws.item_ids.slice(0, 2), reads: [waits(0), waits(1)] });
});
test.afterAll(async () => { await sql.end(); });

const strip = (page: Page) => page.locator(".b-qstrip [data-q]");
const label = (page: Page) => page.locator("[data-block=PaperChecker] .b-keyrow").getAttribute("aria-label");
async function open(page: Page, qr: string) {
  await page.goto(await paperAt({ qr }));
  await expect(page.locator("[data-block=PaperChecker]")).toBeVisible();
}

test("the whole paper is the main picture, and its zoom buttons, wheel and fit change its scale", async ({ page }) => {
  await open(page, QR.alba);
  await expect(page.locator('[data-view="paper"]')).toBeVisible();
  const zoom = page.locator('[data-view="paper"] .b-zoom');
  await expect(zoom).toHaveAttribute("data-zoom", "1.00");
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(Number(await zoom.getAttribute("data-zoom"))).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Fit the picture" }).click();
  await expect(zoom).toHaveAttribute("data-zoom", "1.00");
  const at = (await zoom.boundingBox())!;
  await page.mouse.move(at.x + 20, at.y + 20);
  await page.mouse.wheel(0, -300);
  await expect.poll(async () => Number(await zoom.getAttribute("data-zoom"))).toBeGreaterThan(1);
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Fit the picture" }).click();
  await expect(zoom).toHaveAttribute("data-zoom", "1.00");
});

test("a strip of numbered questions replaces the wall of pills, coloured by state, with the three signals still three", async ({ page }) => {
  await open(page, QR.alba);
  await expect(strip(page)).toHaveCount(7);
  const marks = await strip(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-mark")));
  // the answers sit in the order of the page, not of the seed: the states are what is asked
  expect([...marks].sort()).toEqual(["blank", "judge", "judge", "judge", "right", "working", "wrong"]);
  await expect(page.locator('.b-q[data-mark="working"]')).toContainText("✎");
  expect(await label(page)).toBe("7 answers: 1 right, 1 wrong, 1 wrong with working, 1 blank, 3 for you to judge");
  // no red "For you to judge" pill for each answer: the by-skill summary is one collapsed line
  await expect(page.locator('[data-part="by-skill"]')).not.toHaveAttribute("open", "");
  await expect(page.locator('[data-part="by-skill"] [data-status="judge"]')).toHaveCount(0);
});

test("choosing a question shows only its snapshot; Next to judge jumps to the next red one", async ({ page }) => {
  await open(page, QR.alba);
  await page.locator('.b-q[data-mark="wrong"]').click();
  await expect(page.locator('[data-view="question"]')).toBeVisible();
  await expect(page.locator('[data-view="paper"]')).toHaveCount(0);
  await expect(page.locator('[data-view="question"] img')).toHaveAttribute("src", /\/api\/scan\/[0-9a-f-]+\/1\?box=0\.1,[0-9.]+,0\.6,[0-9.]+/);
  await expect(page.locator("[data-q-title]")).toContainText("Question");
  // a settled answer has no mark buttons; the next red one does
  await expect(page.locator("[data-mark-btn]")).toHaveCount(0);
  await page.locator('[data-view="question"]').getByRole("button", { name: "Next to judge" }).first().click();
  await expect(page.locator('.b-q[aria-pressed="true"]')).toHaveAttribute("data-mark", "judge");
  await expect(page.locator("[data-mark-btn]")).toHaveCount(4);
  await page.getByRole("button", { name: "The whole paper" }).click();
  await expect(page.locator('[data-view="paper"]')).toBeVisible();
});

test("every to-judge question is marked from the page with the buttons: each press saves once, the counts and progress follow", async ({ page }) => {
  await open(page, QR.alba);
  const saves: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"]) saves.push(r.url()); });
  await expect(page.locator("[data-progress]")).toContainText("0 of 3 judged");
  await page.getByRole("button", { name: "Next to judge" }).first().click();
  await page.locator('[data-mark-btn="right"]').click();
  await expect(page.locator("[data-progress]")).toContainText("1 of 3 judged");
  await page.locator('[data-view="question"]').getByRole("button", { name: "Next to judge" }).first().click();
  await page.locator('[data-mark-btn="working"]').click();
  await expect(page.locator("[data-progress]")).toContainText("2 of 3 judged");
  await page.locator('[data-view="question"]').getByRole("button", { name: "Next to judge" }).first().click();
  await page.locator('[data-mark-btn="blank"]').click();
  await expect(page.locator("[data-progress]")).toContainText("3 of 3 judged");
  expect(await label(page)).toBe("7 answers: 2 right, 1 wrong, 2 wrong with working, 2 blank, 0 for you to judge");
  expect(saves.length).toBe(3);
  // saved as the three signals: wrong with working is a wrong answer whose working shows; blank is not wrong
  const rows = await sql<{ status: string; working_shown: string; n: number }[]>`
    select r.status, r.working_shown, (select count(*)::int from read_correction c where c.item_result_id = r.id and c.judged is not null) as n
    from item_result r where r.id = any(${alba.results.slice(4)}::uuid[]) order by r.created_at, r.id`;
  expect(rows.map((r) => `${r.status}/${r.working_shown}`).sort()).toEqual(["blank/none", "correct/none", "wrong/partial"]);
  expect(rows.every((r) => r.n === 1)).toBe(true);
  // a reload shows the same
  await page.reload();
  expect(await label(page)).toBe("7 answers: 2 right, 1 wrong, 2 wrong with working, 2 blank, 0 for you to judge");
});

test("the keys: 1 to 4 mark, the arrows move", async ({ page }) => {
  await open(page, QR.bea);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.b-q[aria-pressed="true"]')).toHaveAttribute("data-q", bea.results[0]);
  await page.keyboard.press("1");
  await expect(page.locator(`.b-q[data-q="${bea.results[0]}"]`)).toHaveAttribute("data-mark", "right");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('.b-q[aria-pressed="true"]')).toHaveAttribute("data-q", bea.results[1]);
  await page.keyboard.press("3");
  await expect(page.locator(`.b-q[data-q="${bea.results[1]}"]`)).toHaveAttribute("data-mark", "working");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('.b-q[aria-pressed="true"]')).toHaveAttribute("data-q", bea.results[0]);
});

test("at 400 px the strip wraps and the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 900 });
  await open(page, QR.alba);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(wide).toBe(false);
  const s = page.locator(".b-qstrip");
  expect(await s.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  const rows = new Set(await strip(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top))));
  expect(rows.size).toBeGreaterThan(1);
});
