/**
 * U80 (UI-4b, PR 4) — the old addresses of the Papers and Marking pages answer 308 to the screen that took their place, with what they carried
 * kept (old specs: u63 "Papers to approve is the status filter of this list; the old addresses still work", and every spec that walked to one of
 * them). One class of the test's own with a copy read and one answer waiting for a person.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { isoWeek } from "../lib/week";
import { aClass, aReadPaper } from "./rows";

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U80-CLASS";
const QR = "CS80A001"; // CS and six hex
let sheet = "";
let result = "";

test.beforeAll(async () => {
  const kids = await aClass(sql, SECTION, "G2", ["Asha"]);
  const [ws] = await sql<{ id: string; item_ids: string[] }[]>`
    select id, item_ids from sheet_template where source = 'library' and retired_at is null and band = 'G2' and cardinality(item_ids) >= 2 order by code limit 1`;
  const made = await aReadPaper(sql, { qr: QR, child: kids.Asha, template: ws.id, items: ws.item_ids.slice(0, 2), reads: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }] });
  await sql`update sheet_instance set print_status = 'returned', kind = 'assessment', section = ${SECTION}, week = to_date(${isoWeek()}, 'IYYY-"W"IW') where id = ${made.sheet}`;
  sheet = made.sheet;
  result = made.results[1];
});
test.afterAll(async () => {
  await sql`update sheet_instance set print_status = 'void' where section = ${SECTION}`;
  await sql.end();
});

/** Where an old address goes: its status and the address it answers with, not followed. */
const answer = async (request: import("@playwright/test").APIRequestContext, path: string) => {
  const r = await request.get(path, { maxRedirects: 0 });
  const to = r.headers()["location"] ?? "";
  return { status: r.status(), to: to.replace(/^https?:\/\/[^/]+/, "") };
};

test("a paper's old Marking address, by sheet, answers 308 to its paper screen", async ({ page }) => {
  const r = await answer(page.request, `/capture/${sheet}`);
  expect(r.status).toBe(308);
  expect(r.to).toMatch(/^\/children\/assessments\/assessment~U80-CLASS~[^/]+\/1$/);
});

test("the old queue's address with an answer opens the paper screen with that answer in view", async ({ page }) => {
  const r = await answer(page.request, `/capture/check?id=${result}`);
  expect(r.status).toBe(308);
  expect(r.to).toContain(`answer=${result}`);
  expect(r.to).toMatch(/^\/children\/assessments\/assessment~U80-CLASS~/);
  // bare, the queue is the list of assessments
  expect((await answer(page.request, "/capture/check")).to).toBe("/children/assessments");
});

test("a home assessment's old review address, by paper code, answers 308 to its paper screen", async ({ page }) => {
  const r = await answer(page.request, `/papers/review/${QR}`);
  expect(r.status).toBe(308);
  expect(r.to).toMatch(/^\/children\/assessments\/assessment~U80-CLASS~[^/]+\/1$/);
  expect((await answer(page.request, "/papers/review/CSFFFFFF")).to).toBe("/children/assessments");
});

test("an assessment's old card answers 308 to its own screen, and a class's week to approve to the list, with its class and week", async ({ page }) => {
  const week = isoWeek();
  const card = await answer(page.request, `/papers/card?class=${SECTION}&week=${week}&kind=assessment&set=SUB.2D2D`);
  expect(card.status).toBe(308);
  expect(card.to).toBe(`/children/assessments/${encodeURIComponent(`assessment~${SECTION}~${week}~SUB.2D2D`)}`);
  const approve = await answer(page.request, `/papers/approve?section=${SECTION}&week=${week}&kind=assessment`);
  expect(approve.status).toBe(308);
  expect(approve.to).toBe(`/children/assessments?class=${SECTION}&week=${week}&kind=assessment`);
});

test("the Papers list and its maker answer 308 to Assessments", async ({ page }) => {
  for (const path of ["/papers", "/papers/make"]) {
    const r = await answer(page.request, `${path}?class=${SECTION}`);
    expect(r.status, path).toBe(308);
    expect(r.to, path).toBe(`/children/assessments?class=${SECTION}`);
  }
});

test("followed, each old address lands on a screen of Assessments with its title", async ({ page }) => {
  await page.goto(`/capture/${sheet}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check the answers");
  await page.goto(`/papers?class=${SECTION}`);
  await expect(page).toHaveURL(new RegExp(`/children/assessments\\?class=${SECTION}`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Assessments");
});
