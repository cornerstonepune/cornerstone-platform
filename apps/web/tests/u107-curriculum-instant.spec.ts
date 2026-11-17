/**
 * U107 (CP-72, issue #842) — Curriculum opens instantly; a click never waits on the database. Nimish, 17 Nov 2026: "Whenever I click
 * something, it should just immediately open." One test for each Done-when line of specs/CP-72/spec.md. The reads a page makes are
 * written down by the run's own hook (lib/test-hooks.ts, `TEST_HOOKS=1` in playwright.config.ts); the spec's rows sit in Grade 3.
 */
import { expect, test, type Page, type Request } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { gate } from "./m1-13-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G3";
const MATHS = "NUM";
const UNIT = "U107 unit A";
const ROWS = [
  ["LO-U107-A1", UNIT, "school"],
  ["LO-U107-A2", UNIT, "school"],
  ["LO-U107-M1", UNIT, "machine"], // the machine's, so its panel offers Approve
  ["LO-U107-B1", "U107 unit B", "school"],
] as const;
const ACT = "ACT-U107-A";
let tenant = "";
let wasOn = false;

// what the page read since the last call, as the hook wrote it down
const hook = (page: Page) => ({
  take: async () => ((await (await page.request.get("/api/test-hooks")).json()) as { log: string[] }).log,
  set: async (body: { match?: string; delayMs?: number; fail?: boolean; expire?: boolean }) => void (await page.request.post("/api/test-hooks", { data: body })),
});
// the reads CP-72 takes off the tree's page: the list of every activity and skill, the engine's questions and offers, the part gap, the lessons
const HEAVY = ["with t as (", "from ask order by", "engine /curriculum/offers/list", "plan_entry"];
const heavy = (log: string[]) => log.filter((l) => HEAVY.some((h) => l.includes(h)));
const treeRead = (l: string) => l.includes("from learning_objective lo");
// a prefetch: marked so by Next, or the address of an objective's own row (a full-route prefetch carries no mark; these tests click no objective but test 3)
const prefetch = (r: Request) => "next-router-prefetch" in r.headers() || "next-router-segment-prefetch" in r.headers() || r.url().includes("open=objective");
// the request a click made to the server: not a background prefetch, not a picture or a script
const asked = (r: Request) => ["document", "fetch", "xhr"].includes(r.resourceType()) && !prefetch(r) && !r.url().includes("/api/test-hooks");

test.beforeAll(async () => {
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await gate(sql, "reviewer");
  [{ id: tenant }] = await sql<{ id: string }[]>`select tenant_id as id from subject where code = ${MATHS} limit 1`;
  for (const [code, unit, source] of ROWS)
    await sql`
      insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code)
      values (${tenant}, ${code}, ${GRADE}, 'Numeracy', ${unit}, ${`U107 objective ${code.slice(-2)}`}, 'Foundational', ${source}, ${MATHS})
      on conflict (tenant_id, code) do update set unit = excluded.unit, source = excluded.source, retired = false`;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, ${ACT}, ${GRADE}, 'Maths', 'U107 counting activity', 'A') on conflict (tenant_id, code) do nothing`;
  await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (${tenant}, ${ACT}, 'LO-U107-A1', 1, 'school') on conflict do nothing`;
});

test.afterAll(async () => {
  await sql`delete from activity_objective where tenant_id = ${tenant} and activity_code = ${ACT}`;
  await sql`update learning_objective set retired = true where tenant_id = ${tenant} and code like 'LO-U107-%'`;
  await gate(sql, "open");
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const tree = (page: Page) => page.locator("[data-curriculum-tree]");
const unitUrl = `/setup/curriculum?grade=${GRADE}&subject=${MATHS}&unit=${encodeURIComponent(UNIT)}`;

test("1. opening Curriculum reads the tree and nothing of the appendix or To review", { tag: "@core" }, async ({ page }) => {
  const h = hook(page);
  await page.goto("/setup/curriculum");
  await h.set({ expire: true, match: "", delayMs: 0, fail: false });
  await h.take();
  await page.goto(`/setup/curriculum?grade=${GRADE}`);
  await expect(tree(page)).toHaveAttribute("data-grade", GRADE);
  await page.waitForLoadState("networkidle");
  const log = await h.take();
  expect(log.filter(treeRead).length, "the tree's own reads").toBeGreaterThan(0);
  expect(heavy(log), "the reads the tree does not need").toEqual([]);
  // the same page, seen again while what the server keeps is fresh: no read of the tree at all
  await page.goto(`/setup/curriculum?grade=${GRADE}`);
  await expect(tree(page)).toHaveAttribute("data-grade", GRADE);
  await page.waitForLoadState("networkidle");
  expect((await h.take()).filter(treeRead)).toEqual([]);
});

test("2. choosing a grade, opening or closing a subject or a unit makes no request to the server", { tag: "@core" }, async ({ page }) => {
  await page.goto(`/setup/curriculum?grade=${GRADE}`);
  await expect(tree(page)).toHaveAttribute("data-grade", GRADE);
  await page.waitForLoadState("networkidle");
  const sent: string[] = [];
  page.on("request", (r) => asked(r) && sent.push(`${r.method()} ${r.url()}`));
  await page.locator('[data-grade-tab="G2"]').click();
  await expect(tree(page)).toHaveAttribute("data-grade", "G2");
  await page.locator(`[data-grade-tab="${GRADE}"]`).click();
  await expect(tree(page)).toHaveAttribute("data-grade", GRADE);
  const subject = page.locator(`[data-subject-row="${MATHS}"]`);
  await subject.locator("> a").click();
  await expect(subject.locator("[data-unit-row]").first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`grade=${GRADE}&subject=${MATHS}`));
  const unit = page.locator(`[data-unit-row="${UNIT}"]`);
  await unit.locator("> a").click();
  await expect(page.locator("[data-objective-leaf]")).toHaveCount(3);
  await unit.locator("> a").click(); // closes the unit
  await expect(page.locator("[data-objective-leaf]")).toHaveCount(0);
  await subject.locator("> a").click(); // closes the subject
  await expect(subject.locator("[data-unit-row]")).toHaveCount(0);
  expect(sent).toEqual([]);
});

test("3. opening an objective reads that objective only; its row prefetches it as it shows, and on hover", { tag: "@core" }, async ({ page }) => {
  const h = hook(page);
  await page.goto("/setup/curriculum");
  await h.set({ expire: false, match: "", delayMs: 0, fail: false });
  await page.goto(unitUrl);
  await expect(page.locator("[data-objective-leaf]")).toHaveCount(3);
  await page.waitForLoadState("networkidle");
  await h.take();
  const seen: string[] = [];
  page.on("request", (r) => r.url().includes("open=objective") && seen.push(r.url()));
  await page.locator('[data-objective-leaf="LO-U107-A2"]').hover();
  await page.locator('[data-objective-leaf="LO-U107-A1"]').click();
  await expect(page.locator('[data-panel="open"]')).toContainText("U107 objective A1");
  await page.waitForLoadState("networkidle");
  const log = await h.take();
  expect(seen.length, "the objective's address was asked for in advance or on the click").toBeGreaterThan(0);
  expect(heavy(log)).toEqual([]);
  expect(log.filter(treeRead), "the tree is not read again").toEqual([]);
  expect(log.some((l) => l.includes("from learning_objective where code =")), "the objective itself is read").toBe(true);
});

test("4. the appendix and To review still show their counts", { tag: "@core" }, async ({ page }) => {
  const [{ open }] = await sql<{ open: number }[]>`select count(*)::int as open from ask where answer is null`;
  await page.goto("/setup/curriculum?view=review&kind=asks");
  const asks = page.locator('[data-review-kind="asks"]');
  await expect(asks).toContainText(String(open));
  await page.goto("/setup/curriculum?view=appendix");
  await expect(page.locator("[data-row]").first()).toBeVisible();
  await expect(page.locator('[data-appendix-part="objectives"]')).toBeVisible();
});

test("5. an edit anywhere in Curriculum shows in the tree on the next open", { tag: "@core" }, async ({ page }) => {
  const h = hook(page);
  await page.goto(unitUrl);
  await page.waitForLoadState("networkidle");
  const units = () => page.locator(`[data-unit-row="${UNIT}"] [data-count="objectives"]`);
  await expect(units()).toHaveAttribute("data-n", "3");
  // behind the page's back, as the engine writes: what the server keeps still shows the old figure
  await sql`
    insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code)
    values (${tenant}, 'LO-U107-A3', ${GRADE}, 'Numeracy', ${UNIT}, 'U107 objective A3', 'Foundational', 'school', ${MATHS})
    on conflict (tenant_id, code) do update set retired = false`;
  await page.goto(unitUrl);
  await expect(units()).toHaveAttribute("data-n", "3");
  // an edit made on the website: an objective is approved, and the next open reads afresh
  await page.goto(`${unitUrl}&open=objective:LO-U107-M1`);
  await page.locator("[data-approve]").click();
  await expect(page.locator("[data-approve-form]")).toHaveCount(0);
  await page.goto(unitUrl);
  await expect(units()).toHaveAttribute("data-n", "4");
  await h.set({ expire: true });
});

test("6. with the database slow the tree still opens; a read that fails is a quiet line to retry, never the page error", { tag: "@core" }, async ({ page }) => {
  const h = hook(page);
  await h.set({ expire: true });
  await page.goto(`/setup/curriculum?grade=${GRADE}`); // fills what the server keeps
  await expect(tree(page)).toHaveAttribute("data-grade", GRADE);
  await h.set({ match: "from learning_objective", delayMs: 3000, fail: false });
  const t0 = Date.now();
  await page.goto(`/setup/curriculum?grade=${GRADE}&subject=${MATHS}`);
  await expect(page.locator(`[data-subject-row="${MATHS}"] [data-unit-row]`).first()).toBeVisible();
  expect(Date.now() - t0, "the tree opens from what it holds").toBeLessThan(2500);
  // the database refuses: with nothing held, a quiet line, and the retry works once it answers
  await h.set({ expire: true, match: "from learning_objective", delayMs: 0, fail: true });
  await page.goto(`/setup/curriculum?grade=${GRADE}`);
  const retry = page.getByRole("link", { name: "Try again" });
  await expect(retry).toBeVisible();
  await expect(page.getByText("This page could not load")).toHaveCount(0);
  await h.set({ match: "", fail: false });
  await retry.click();
  await expect(tree(page)).toHaveAttribute("data-grade", GRADE);
});
