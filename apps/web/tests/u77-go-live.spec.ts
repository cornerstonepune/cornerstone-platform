/**
 * U77 (UI-6b) — Go live on the fortnight page and the table of what it changed (specs/UI-6b/spec.md, Done when 1 to 3), against the
 * engine's `POST /timetable/go-live`. The class "U77" and its fortnights 7411 and 7412 are this spec's own (tests/timetable-rows.ts);
 * a placed draft that swaps two lessons on one day is kept the way the engine's own test does it (tests/go-live-fixture.py).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";
import { timetableRows, type Fixture } from "./timetable-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const REPO = path.resolve(__dirname, "../../..");
const EDUCATOR = { email: "u77-educator@cornerstone.test", name: "Timetable Educator Four", role: "educator", classes: [], subjects: ["NUM"] };
let f: Fixture;
const NUMBER = 7412;
const PAGE = `/timetable/fortnight/${NUMBER}`;

// The fortnight's state is set directly, past the trigger that wants every class settled in the approval ledger: settling a class is the
// engine's own business (its tests cover it); this spec is about what the page does once the fortnight is approved.
const state = (s: string) =>
  sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await tx`update fortnight set state = ${s} where id = ${f.ahead}`;
  });
const placements = async () =>
  new Map((await sql<{ id: string; day: string; period: string }[]>`
    select s.id, d.on_date::text as day, s.period_id::text as period from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${f.klass}`).map((r) => [r.id, `${r.day}|${r.period}`]));
const keepADraft = () =>
  execFileSync(path.join(REPO, "packages/engine/.venv/bin/python"), [path.join(__dirname, "go-live-fixture.py"), "K1", "U77", "2041-42", String(NUMBER)], { env: process.env, stdio: "pipe" });

test.beforeAll(async () => {
  f = await timetableRows(sql, "u77");
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  const [mine] = await sql<{ staff: string }[]>`select staff_id as staff from pii.staff where email = ${EDUCATOR.email}`;
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${f.tenant}, ${mine.staff}, 'cover_educator', ${f.klass}, current_date - 3, 'u77 test'
    where not exists (select 1 from staff_role_grant g where g.staff_id = ${mine.staff} and g.school_class_id = ${f.klass} and g.role_code = 'cover_educator')`;
});
test.afterAll(async () => {
  await state("aligned");
  await sql.end();
});

const educator = async (browser: import("@playwright/test").Browser) => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context;
};

test("Go live comes only after Approve, and an educator never sees it", async ({ page, browser }) => {
  keepADraft();
  await state("aligned");
  await page.goto(PAGE);
  await expect(page.getByRole("button", { name: "Go live" })).toHaveCount(0); // not approved yet: Approve first
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(1);
  await state("approved");
  await page.goto(PAGE);
  await expect(page.getByRole("button", { name: "Go live" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  const edu = await (await educator(browser)).newPage();
  await edu.goto(PAGE);
  await expect(edu.getByRole("button", { name: /Go live|Approve/ })).toHaveCount(0);
});

test("Go live updates sessions in place and the table lists exactly the sessions it changed", async ({ page }) => {
  keepADraft();
  await state("approved");
  const before = await placements();
  await page.goto(PAGE);
  await page.getByLabel(/Reason/).fill("u77 go live");
  await page.getByRole("button", { name: "Go live" }).click();
  const card = page.locator("[data-card=what-changed]");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-went-live]")).toContainText(`Fortnight ${NUMBER} went live`);
  const after = await placements();
  const changed = [...before.keys()].filter((id) => before.get(id) !== after.get(id));
  expect(changed.length).toBeGreaterThan(0);
  expect([...before.keys()].every((id) => after.has(id))).toBe(true); // every session kept its id: updated in place
  const listed = await card.locator("[data-session]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-session")));
  expect(new Set(listed)).toEqual(new Set(changed)); // every changed session, and nothing else
  expect(listed.length).toBe(changed.length);
  // the table is kept in this browser: a reload still lists it
  await page.reload();
  await expect(page.locator("[data-card=what-changed] [data-session]")).toHaveCount(changed.length);
});

test("an educator's request to go live is answered 403 and changes nothing; with no draft the engine's words come back", async ({ browser, page }) => {
  const before = JSON.stringify([...(await placements())]);
  const edu = await educator(browser);
  const refused = await edu.request.post("/api/timetable/golive", { multipart: { fortnight: String(NUMBER) } });
  expect(refused.status()).toBe(403);
  expect(JSON.stringify([...(await placements())])).toBe(before);
  const none = await page.request.post("/api/timetable/golive", { multipart: { fortnight: "7411" } }); // this class's other fortnight: no draft kept
  expect(none.status()).toBe(409);
  expect(((await none.json()) as { error: string }).error).toMatch(/placed draft/);
});
