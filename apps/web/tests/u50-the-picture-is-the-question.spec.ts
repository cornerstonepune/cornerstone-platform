/**
 * CK1 — the picture is the question (goals/ck1-the-picture-is-the-question.yaml).
 *
 * Nimish, 2026-10-22, from the live check screen: it said "question 8" and showed the printed question "11 How many dots
 * are there in all?". The paper here is the test's own: one picture of a page with its twelve questions printed down it,
 * and an answer for some of them, each with the box it was read from as the engine stores it.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { aClass, aReadPaper, aWorksheet } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
test.afterAll(async () => sql.end());

const W = 1000;
const H = 1400;
const ROW = 105;
const top = (n: number) => 60 + (n - 1) * ROW;
// the part of the page question n is printed on, as fractions of it
const region = (n: number) => [0.02, (top(n) - 10) / H, 0.98, (top(n) + 95) / H];
const WORDS = "How many dots are there in all?";

let id: Record<number, string> = {};
test.beforeAll(async ({ browser }) => {
  const shot = await browser.newPage({ viewport: { width: W, height: H } });
  const rows = Array.from({ length: 12 }, (_, i) => i + 1)
    .map((n) => `<div style="position:absolute;left:40px;top:${top(n)}px;font:44px sans-serif">${n} ${WORDS}</div>`)
    .join("");
  await shot.setContent(`<body style="margin:0;background:white">${rows}</body>`, { waitUntil: "load" });
  // Not before the page has laid out its fonts and painted two frames: a capture taken on a page that had not yet
  // painted failed once in CI with "Page.captureScreenshot: Unable to capture screenshot" (run 39921528802), before
  // any of the school's code ran.
  await shot.evaluate(
    () => document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))),
  );
  const dir = mkdtempSync(path.join(tmpdir(), "ck1-"));
  const file = path.join(dir, "ck1-paper.png");
  writeFileSync(file, await shot.screenshot());
  await shot.close();

  const kids = await aClass(sql, "CK1-TEST", "G1", ["Mahishmati"]);
  const w = await aWorksheet(sql, {
    code: "CK1-A", title: "Equal groups", date: "2026-10-22", band: "G1", week: "CK1-TEST",
    items: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, page: 1, expr: `${i + 2} + ${i + 3}`, question: `${WORDS}` })),
  });
  const held = { status: "needs_teacher", why: "read as a right answer; a person checks every answer of this kind until the reader is trusted on it" };
  const shared = region(7);
  const read = (n: number, extra: object) => ({ ...held, read: String(n), guess: String(n), ...extra });
  const p = await aReadPaper(sql, {
    qr: "CK1TEST-1", child: kids.Mahishmati, template: w.template, items: w.items, file,
    reads: [
      read(1, { box: shared, boxes: 1 }), // one box for three questions: none of them is its own
      read(2, { box: region(11) }), // a region found by words, and it is question 11's
      read(3, {}), // no box at all
      read(4, { box: region(4), boxes: 1 }), // cut from its own printed boxes
      read(5, {}), read(6, {}),
      read(7, { box: shared, boxes: 1 }),
      read(8, { box: shared, boxes: 1 }),
    ],
  });
  id = Object.fromEntries(p.results.map((r, i) => [i + 1, r]));
});

const open = async (page: Page, n: number) => {
  await page.goto(`/capture/check?id=${id[n]}`);
  // the question's number is said under the picture and over the answer
  await expect(page.locator("figure")).toContainText(new RegExp(`question ${n}`, "i"));
};
const shown = (page: Page) => page.locator("figure img");
const outline = (page: Page) => page.getByTestId("crop-outline");
const natural = async (page: Page) => shown(page).evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]);
const shoot = async (page: Page, label: string) => {
  if (!process.env.CK1_SHOTS) return;
  const dir = path.resolve(__dirname, "../../../docs/notes/ck1-the-picture-is-the-question");
  mkdirSync(dir, { recursive: true });
  await page.locator("figure").screenshot({ path: path.join(dir, `${process.env.CK1_SHOTS}-${label}.png`) });
};

test("the question's own number and printed words head the picture", async ({ page }) => {
  await open(page, 8);
  await expect(page.getByRole("region", { name: "Say what the child wrote" }).getByRole("heading")).toContainText(`Question 8: ${WORDS}`);
});

test("an answer cut from its own printed boxes has its part of the page outlined, the whole page shown", async ({ page }) => {
  await open(page, 4);
  await shoot(page, "own-box-q4");
  await expect(outline(page)).toBeVisible();
  await expect(page.locator("figure")).toContainText("Question 4 is outlined");
  await expect.poll(async () => (await natural(page))[1]).toBeGreaterThanOrEqual(H);
  await expect(shown(page)).not.toHaveAttribute("src", /box=/);
});

test("a box another question shares is not outlined: the page and the plain line instead", async ({ page }) => {
  for (const n of [1, 7, 8]) {
    await open(page, n);
    if (n === 8) await shoot(page, "shared-box-q8");
    await expect(outline(page)).toHaveCount(0);
    await expect(page.locator("figure")).toContainText(`We could not find question ${n} on this page: it is somewhere on this page`);
  }
});

test("a region found by words, here another question's, is never outlined as this question's", async ({ page }) => {
  await open(page, 2);
  await shoot(page, "words-region-q2");
  await expect(outline(page)).toHaveCount(0);
  await expect(page.locator("figure")).toContainText("We could not find question 2 on this page");
});

test("an answer with no box shows the whole page, and a click opens it to full size", async ({ page }) => {
  await open(page, 3);
  await shoot(page, "whole-page-q3");
  await expect.poll(async () => (await natural(page))[1]).toBeGreaterThanOrEqual(H);
  await expect(outline(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open the page at full size" })).toHaveAttribute("href", /^\/api\/scan\/[0-9a-f-]{36}\/1$/);
});

test("no two answers of a page are outlined in the same part of it", async ({ page }) => {
  const boxes: string[] = [];
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await open(page, n);
    const at = await outline(page).count() ? await outline(page).getAttribute("style") : null;
    if (at) boxes.push(at);
  }
  expect(boxes.length).toBeGreaterThan(0);
  expect(new Set(boxes).size, "two answers outlined one box").toBe(boxes.length);
});
