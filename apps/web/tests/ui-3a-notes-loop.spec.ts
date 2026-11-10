/**
 * UI-3a — the notes loop: period, record, confirm, notes (issue #518, backend #565). One test per Done-when line of the four
 * screens in docs/frontend/screens.json. Rows are the test's own (tests/k2-rows.ts: a K2 class "M104", Sr. Nos 1 to 22, two
 * activities) plus one lesson of today with no activity. Notes are made as the engine leaves them (drafted, words typed).
 * The two K2 switches are on only inside a test.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aK2Note, k2Class, noNotesWaiting, voiceSwitch } from "./k2-rows";
import { SIGNED_IN } from "../playwright.config";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let klass: string;
let staff: string;
let lesson: string;

const TODAY = sql`(now() at time zone (select value #>> '{}' from config where key = 'school.time_zone'))::date`;

test.beforeAll(async () => {
  ({ klass, staff } = await k2Class(sql));
  // one lesson of today for the class, a fixed part of the day: no activity, so nothing to record
  const [{ id: t }] = await sql<{ id: string }[]>`select tenant_id as id from school_class where id = ${klass}`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select campus_id as id from school_class where id = ${klass}`;
  const [{ id: day }] = await sql<{ id: string }[]>`
    insert into school_day (tenant_id, campus_id, on_date, kind) select ${t}, ${campus}, ${TODAY}, 'teaching'
    on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
  const [{ id: period }] = await sql<{ id: string }[]>`
    insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${t}, 'K2', 90, '03:10', '03:40', 'UI-3a settling in', true)
    on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
  const [s] = await sql<{ id: string }[]>`
    insert into session (tenant_id, school_class_id, school_day_id, period_id, kind, text) values (${t}, ${klass}, ${day}, ${period}, 'fixed', 'Settling in')
    on conflict (school_class_id, school_day_id, period_id) do update set text = excluded.text returning id`;
  lesson = s.id;
});
test.afterAll(async () => {
  await voiceSwitch(sql, false);
  await sql.end();
});
test.beforeEach(async () => {
  await voiceSwitch(sql, true);
  await noNotesWaiting(sql, { klass, staff });
});

test("Period: a period with no activity shows no capture controls and the words 'Nothing to record here'", async ({ page }) => {
  await page.goto(`/period/${lesson}`);
  await expect(page.getByRole("main")).toContainText("Nothing to record here");
  await expect(page.locator('a[href^="/record"]')).toHaveCount(0);
  await expect(page.locator("[data-block=CaptureBar], [data-rail-part=capture]")).toHaveCount(0);
});

test("Record: Type the marks writes one note with this session's id and nothing in activity_observation", async ({ page }) => {
  const before = (await sql<{ n: number }[]>`select count(*)::int as n from pii.educator_note where session_id = ${lesson}`)[0].n;
  await page.goto(`/record?class=${klass}&session=${lesson}`);
  await page.getByRole("button", { name: "Type the marks" }).first().click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  const rows = await sql<{ session_id: string; audio_key: string | null }[]>`select session_id::text, audio_key from pii.educator_note where session_id = ${lesson}`;
  expect(rows).toHaveLength(before + 1);
  expect((await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where note_id = ${id}`)[0].n).toBe(0);
});

test("Record: at 400 px the Start button is the full width and at least 56 px tall", async ({ browser }) => {
  const c = await browser.newContext({ storageState: SIGNED_IN, viewport: { width: 400, height: 800 } });
  const p = await c.newPage();
  await p.goto(`/record?class=${klass}`);
  const box = (await p.locator("[data-record]").boundingBox())!;
  const main = (await p.locator("main").boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(56);
  expect(box.width).toBeGreaterThanOrEqual(main.width - 2 * 16 - 2);
  await c.close();
});

test("Record: a denied microphone shows the typed path as the main action instead of an error", async ({ browser }) => {
  const c = await browser.newContext({ storageState: SIGNED_IN, viewport: { width: 400, height: 800 } });
  await c.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  const p = await c.newPage();
  await p.goto(`/record?class=${klass}`);
  await p.locator("[data-record]").click();
  await expect(p.locator("p[role=alert]").getByRole("button", { name: "Type the marks" })).toBeVisible();
  await c.close();
});

test("Confirm: one activity_observation per marked child, none for an unmarked child, all with one confirmation_id; no control confirms more than one note", async ({ page }) => {
  const note = await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3. Below 5. The rest did not get a mark.");
  const other = await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 9.");
  await page.goto(`/notes/${note}`);
  await expect(page.getByRole("button", { name: "Confirm this note" })).toHaveCount(1);
  await page.getByRole("button", { name: "Confirm this note" }).click();
  await expect(page).toHaveURL(/\/notes(\/[0-9a-f-]{36})?$/);
  const rows = await sql<{ child: string; cid: string }[]>`select child_id::text as child, confirmation_id::text as cid from activity_observation where note_id = ${note}`;
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((r) => r.cid)).size).toBe(1);
  expect((await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where note_id = ${other}`)[0].n).toBe(0);
});

test("Confirm: a child's square is never red, and a name on a claim opens ChildPeek which Escape closes", async ({ page }) => {
  const note = await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3. Absent 5.");
  await page.goto(`/notes/${note}`);
  await expect(page.locator("[data-roll] [data-tone=act], [data-roll][data-state=late]")).toHaveCount(0);
  await page.locator("[data-roll='3']").click(); // a square changes the mark, never opens the peek
  await expect(page.locator("[data-block=ChildPeek]")).toHaveCount(0);
});

test("Notes: a note left unconfirmed carries the red 'late' chip and sorts first; the board's lanes count the table's rows", async ({ page }) => {
  await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3.");
  const late = await aK2Note(sql, { klass, staff }, "Activity 907, level 1. Below 4.", "left_unconfirmed");
  await page.goto(`/notes?class=${klass}&view=table`);
  const rows = page.locator("table tbody tr");
  await expect(rows.first().locator(`a[href="/notes/${late}"]`)).toHaveCount(1);
  await expect(rows.first().locator("[data-status=late]")).toBeVisible();
  const inTable = await rows.count();
  await page.goto(`/notes?class=${klass}&view=board`);
  const counts = await page.locator("[data-block=KanbanBoard] .b-count").allInnerTexts();
  expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(inTable);
});

test("Notes: a correction writes a superseding row with a reason and never updates the old one", async ({ page }) => {
  const note = await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3.");
  await page.goto(`/notes/${note}`);
  await page.getByRole("button", { name: "Confirm this note" }).click();
  await page.waitForURL(/\/notes/);
  const [first] = await sql<{ id: string; outcome: string }[]>`select id::text, outcome from activity_observation where note_id = ${note} and outcome = 'above' limit 1`;
  await page.goto(`/notes/${note}`);
  await page.locator("select[name=observation]").selectOption(first.id);
  await page.locator("select[name=outcome]").selectOption("below");
  await page.locator("input[name=reason]").fill("I misheard the number");
  await page.getByRole("button", { name: "Correct this note" }).click();
  await expect.poll(async () => (await sql`select 1 from activity_observation where supersedes = ${first.id} and reason = 'I misheard the number' and outcome = 'below'`).length).toBe(1);
  const [old] = await sql<{ outcome: string }[]>`select outcome from activity_observation where id = ${first.id}`;
  expect(old.outcome).toBe("above");
});
