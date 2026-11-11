/**
 * U78 (UI-4b, PR 3) — whose paper a page is, and walking a paper answer by answer, on the paper screen, with the old assertions
 * (old spec: u78-whose-paper tests 2, 3 and 4; the Yes button is now the save of "what the child wrote", held back the same way).
 *
 * The papers are the test's own (tests/rows.ts): three children of one class cut from one scanned file — copy 1, Bina's copy 2 holding copy 1's very
 * photograph, Chitra's copy 3 — and Esha's, a fourth.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { openPaper } from "./paper-screen";
import { aClass, aReadPaper, aWorksheet } from "./rows";

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
test.afterAll(async () => sql.end());

const SCANS = path.join(tmpdir(), "u78-whose-paper");
const PYTHON = path.resolve(__dirname, "../../../packages/engine/.venv/bin/python");
// A scan: one photograph per page, each the QR of the text given — the same text on two pages is the same photograph.
const scan = (file: string, text: string) => {
  mkdirSync(path.dirname(file), { recursive: true });
  execFileSync(PYTHON, ["-I", "-c", `
import io, sys, pymupdf, segno
buf = io.BytesIO(); segno.make(sys.argv[2], error="h").save(buf, kind="png", scale=9, border=4)
doc = pymupdf.open(); page = doc.new_page(); page.insert_image(page.rect, stream=buf.getvalue()); doc.save(sys.argv[1])
`, file, text]);
  return file;
};

type Ids = { sheet: string; capture: string; results: string[] };
const made: Record<string, Ids> = {};

test.beforeAll(async () => {
  const kids = await aClass(sql, "U78-TEST", "G1", ["Mahishmati", "Bina", "Chitra", "Esha"]);
  const alone = await aClass(sql, "U78-ALONE", "G1", ["Devi"]);
  const sums = ["4 + 3", "5 + 2", "6 + 3"];
  const sheet = (code: string, week: string) =>
    aWorksheet(sql, {
      code, title: "U78 paper", date: "2026-10-21", band: "G1", week,
      items: sums.map((expr, i) => ({ n: i + 1, page: 1, expr, question: expr })),
    });
  const [w, w2] = [await sheet("U78-A", "U78-TEST"), await sheet("U78-B", "U78-ALONE")];
  // each question its own printed box (`boxes: 1`), or the screen shows the whole page and outlines nothing
  const unsure = (guess: string, n: number) => ({ status: "unreadable", why: "not sure of the digits", guess, box: [0.1, 0.2 * n, 0.5, 0.2 * n + 0.1], boxes: 1 });
  const copy = async (k: number, qr: string, text: string, child: string, t: typeof w, reads: Parameters<typeof aReadPaper>[1]["reads"]) =>
    (made[qr] = await aReadPaper(sql, { qr, child, template: t.template, items: t.items, reads, file: scan(path.join(SCANS, "scan-1", `copy0${k}-p1-${qr}.pdf`), text) }));
  await copy(1, "CSB00001", "CSB00001", kids.Mahishmati, w, [unsure("7", 1), unsure("7", 2), { status: "correct", read: "9" }]);
  await copy(2, "CSB00002", "CSB00001", kids.Bina, w, [unsure("7", 1), { status: "correct", read: "7" }, { status: "correct", read: "9" }]); // copy 1's photograph
  await copy(3, "CSB00003", "CSB00003", kids.Chitra, w, [{ status: "correct", read: "7" }, { status: "correct", read: "7" }, { status: "correct", read: "9" }]);
  await copy(4, "CSB00005", "CSB00005", kids.Esha, w, [unsure("7", 1), { status: "correct", read: "7" }, { status: "correct", read: "9" }]);
  // Chitra sat a second paper a week later: her papers are two, each on its own paper screen
  const w3 = await aWorksheet(sql, { code: "U78-C", title: "U78 later", date: "2026-10-28", band: "G1", week: "U78-NEXT", items: sums.map((expr, i) => ({ n: i + 1, page: 1, expr, question: expr })) });
  made.CSB00006 = await aReadPaper(sql, {
    qr: "CSB00006", child: kids.Chitra, template: w3.template, items: w3.items, file: scan(path.join(SCANS, "scan-2", "copy01-p1-CSB00006.pdf"), "CSB00006"),
    reads: [{ status: "correct", read: "7" }, unsure("7", 2), { status: "correct", read: "9" }],
  });
  await copy(1, "CSB00004", "CSB00004", alone.Devi, w2, [{ status: "correct", read: "7" }, { status: "correct", read: "7" }, { status: "wrong", read: "8", checkedBy: "rows.ts" }]);
});


const panel = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Say what the child wrote" });

test("beside the picture, the page's own proof: the crop outlined, the printed code, the copy and the page", async ({ page }) => {
  await openPaper(page, "U78-TEST", "1", "U78-TEST");
  const proof = panel(page).getByLabel("Whose paper this page is");
  await expect(proof.getByText("CSB00001").first()).toBeVisible();
  await expect(proof.getByText("Copy 1 of 4 in this file · page 1 of 1")).toBeVisible();
  await expect(page.getByTestId("crop-outline")).toBeVisible();
  const photo = page.locator("figure[data-block=PageImage] img");
  await expect.poll(() => photo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  // a copy whose photograph is its own carries no notice
  await openPaper(page, "U78-TEST", "4", "U78-TEST");
  await expect(panel(page).getByLabel("Whose paper this page is").getByText("same picture")).toHaveCount(0);
  await expect(page.getByText("Copy 4 of 4 in this file · page 1 of 1")).toBeVisible();
});

test("a paper is walked answer by answer: the next answer to judge, until none is left", async ({ page }) => {
  await openPaper(page, "U78-TEST", "1", "U78-TEST");
  // Mahishmati's copy has two answers for a person to judge
  const next = page.locator("[data-next-answer]");
  await expect(next).toContainText("Next answer to judge");
  await expect(page.getByText("1 left on this paper after this one")).toBeVisible();
  const first = await panel(page).getByRole("heading").innerText();
  await next.click();
  await expect(panel(page).getByRole("heading")).not.toHaveText(first);
  await expect(page.locator("[data-next-answer]")).toHaveCount(0);
});

test("the same photograph on two children's copies is a plain red notice, and saving waits for a person", async ({ page }) => {
  await openPaper(page, "U78-TEST", "2", "U78-TEST");
  const proof = panel(page).getByLabel("Whose paper this page is");
  await expect(proof.getByText(/same picture as a page of copy 1 in this file/)).toBeVisible();
  const save = panel(page).getByRole("button", { name: "Say what the child wrote" });
  await expect(save).toBeDisabled();
  await proof.getByRole("button", { name: "This page is this child’s" }).click();
  await expect(panel(page).getByLabel("Whose paper this page is").getByText("e2e@cornerstone.test said this page is this child’s.")).toBeVisible();
  await expect(panel(page).getByRole("button", { name: "Say what the child wrote" })).toBeEnabled();
  // the choice stands on the page's own capture, and is kept as a row of the one history log (CP-27 3C)
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from change_log
    where table_name = 'capture' and row_id = ${made.CSB00002.capture}::text and op = 'choose_page'`;
  expect(n).toBe(1);
});

test("a child's papers are walked from paper to paper, oldest first, and a paper says what it says skill by skill", async ({ page }) => {
  // Chitra's later paper has an answer for a person to judge, so it is the one with a way in
  await openPaper(page, "U78-TEST", "3", "U78-NEXT");
  await expect(page.getByLabel("This child's papers")).toContainText("Paper 2 of 2 for this child");
  await expect(page.locator("[data-next-paper]")).toHaveCount(0);
  // by skill: each lane counts the answers settled and what is still with the person; the three signals stay three
  const lane = () => page.getByRole("region", { name: "What this paper says, by skill" }).locator("[data-lane]").first();
  await expect(lane()).toContainText("still with you");
  await page.locator("[data-prev-paper]").click();
  await expect(page.getByLabel("This child's papers")).toContainText("Paper 1 of 2 for this child");
  await expect(page.locator("[data-prev-paper]")).toHaveCount(0);
  await expect(lane()).toContainText("3 of 3 right");
  await page.locator("[data-next-paper]").click();
  await expect(page.getByLabel("This child's papers")).toContainText("Paper 2 of 2 for this child");
});
