/**
 * CP-61 — the Assessments board's cards are one layout (specs/CP-61/spec.md). Nimish, 16 Nov 2026: "That consistency is not there."
 * One test per "Done when" line. A class of the spec's own (CP61-BOARD, Grade 3): a class assessment whose papers are with the children,
 * and one read, with answers waiting for a person (two on one paper, one on another), and a paper signed off.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_FIRST_NAMES } from "./fake-names";
import { aClass, aReadPaper } from "./rows";
import { isoWeek } from "../lib/week";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "CP61-BOARD";
const BOARD = `/children/assessments?class=${SECTION}`;
const THIS = isoWeek();
const [ALBA, BEA, CAL, DOT] = FAKE_FIRST_NAMES;
const QR = { alba: "CS61A001", bea: "CS61A002", cal: "CS61A003", dot: "CS61A004" };
let kids: Record<string, string> = {};

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G3", [ALBA, BEA, CAL, DOT]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids[ALBA]}`;
  const [ws] = await sql<{ id: string; item_ids: string[] }[]>`
    select id, item_ids from sheet_template
    where source = 'library' and retired_at is null and band = 'G3' and array_length(item_ids, 1) >= 3 order by code limit 1`;
  if (!ws) throw new Error("needs a library worksheet of three items or more for Grade 3");
  const paper = (qr: string, child: string) => sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at)
    select ${tenant}, ${qr}, ${ws.id}, ${child}, to_date(${THIS}, 'IYYY-"W"IW'), ${SECTION}, 'assessment', 'printed', 'cp61', now()
    where not exists (select 1 from sheet_instance where qr_code = ${qr})`;
  for (const [qr, who] of [[QR.alba, ALBA], [QR.bea, BEA], [QR.cal, CAL], [QR.dot, DOT]] as const) await paper(qr, kids[who]);
  const items = ws.item_ids.slice(0, 3);
  const waits = { status: "needs_teacher", read: "7", why: "under the confidence floor" } as const;
  await aReadPaper(sql, { qr: QR.bea, child: kids[BEA], template: ws.id, items, reads: [{ status: "correct", key: true }, waits, waits] });
  await aReadPaper(sql, { qr: QR.cal, child: kids[CAL], template: ws.id, items, reads: [waits, { status: "correct", key: true }, { status: "correct", key: true }] });
});
test.afterAll(async () => { await sql.end(); });

/** True when none of the element's text is cut off sideways. */
const whole = (el: Locator) => el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1);
const cards = (page: Page) => page.locator("[data-kcard]");

for (const width of [400, 768, 1440]) {
  test(`at ${width} px no card text is clipped: title, chip and button show whole`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(BOARD);
    await expect(cards(page).first()).toBeVisible();
    for (const item of await page.locator(".b-kitem").all()) {
      const title = item.locator(".b-ktitle");
      expect(await whole(title), "title").toBe(true);
      // a title of more than three lines is cut with its full text on hover and focus
      await expect(item.locator("[data-kcard]")).toHaveAttribute("title", /.+/);
      expect(await whole(item.locator("[data-status]")), "chip").toBe(true);
      const chip = item.locator("[data-status]");
      const box = await chip.boundingBox();
      const card = await item.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(card!.x + card!.width + 1);
      for (const b of await item.locator("[data-card-next]").all()) {
        expect(await whole(b), "button").toBe(true);
        const bb = await b.boundingBox();
        expect(bb!.x + bb!.width).toBeLessThanOrEqual(card!.x + card!.width + 1);
      }
    }
  });
}

test("a card says its subject, then its class and day, then how many papers are back, as three lines", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BOARD);
  const card = cards(page).first();
  await expect(card).toBeVisible();
  await expect(card.locator(".b-sub")).toHaveCount(1);
  await expect(card.locator(".b-progress")).toHaveText(/^\d+ of \d+ papers back$/);
  await expect(card.locator("[data-status]")).toHaveCount(1);
});

test("cards in one column share one height, and every button has one size", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BOARD);
  await expect(cards(page).first()).toBeVisible();
  const sizes = new Set<string>();
  for (const lane of await page.locator("[data-lane]").all()) {
    const heights = await lane.locator(".b-kitem").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(heights).size, `one height in lane ${await lane.getAttribute("data-lane")}: ${heights}`).toBeLessThanOrEqual(1);
    for (const b of await lane.locator("[data-card-next]").all()) {
      const bb = (await b.boundingBox())!;
      sizes.add(`${Math.round(bb.height)}`);
    }
  }
  expect(sizes.size).toBeLessThanOrEqual(1);
});

test("the panel lists each paper once, with its answers to judge, and sums the red items once", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BOARD);
  await page.locator('[data-lane="check"] [data-kcard]').first().click();
  const panel = page.locator("[data-block=DetailPanel]");
  const list = panel.locator("[data-copies]");
  await expect(list).toBeVisible();
  const rows = list.locator("[data-copy]");
  const rolls = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-copy")));
  expect(new Set(rolls).size).toBe(rolls.length);
  // the header says it once: 3 answers on 2 papers
  await expect(panel.locator("[data-judge-sum]")).toHaveText("3 answers to judge on 2 papers");
  await expect(panel.locator("[data-judge-sum]")).toHaveCount(1);
  // no red pill on a row; the row says "To judge n"
  await expect(list.locator('[data-status="judge"]')).toHaveCount(0);
  const judging = rows.filter({ hasText: /To judge \d/ });
  await expect(judging).toHaveCount(2);
  const counts = (await judging.evaluateAll((els) => els.map((e) => e.getAttribute("data-judge")))).sort();
  expect(counts).toEqual(["1", "2"]);
  await expect(rows.filter({ hasText: /Sr\. No\./ })).toHaveCount(rolls.length);
  // one tap opens the paper
  await judging.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/children\/assessments\/[^/]+\/\d+/);
});
