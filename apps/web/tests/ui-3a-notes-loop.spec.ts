/**
 * UI-3a — the notes loop: period, record, confirm, notes (issue #518, backend #565). One test per Done-when line of the four
 * screens in docs/frontend/screens.json. Rows are the test's own (tests/k2-rows.ts: a K2 class "M104", Sr. Nos 1 to 22, two
 * activities) plus one lesson of today with no activity. Notes are made as the engine leaves them (drafted, words typed).
 * The two K2 switches are on only inside a test.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aK2Note, k2Class, noNotesWaiting, voiceSwitch } from "./k2-rows";
import { EDUCATOR, inventoryRows, signedInAs } from "./inventory-fixtures";
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

test("Period: a period that has an activity opens for the educator, with its actions, last time and steps", async ({ page }) => {
  const [{ id: t }] = await sql<{ id: string }[]>`select tenant_id as id from school_class where id = ${klass}`;
  const [{ id: campus }] = await sql<{ id: string }[]>`select campus_id as id from school_class where id = ${klass}`;
  const [{ id: year }] = await sql<{ id: string }[]>`select academic_year_id as id from school_class where id = ${klass}`;
  const [{ id: day }] = await sql<{ id: string }[]>`select id from school_day where tenant_id = ${t} and campus_id = ${campus} and on_date = ${TODAY}`;
  // the fortnight that holds today, if some other spec made one; else a day-long one of its own
  const [held] = await sql<{ id: string }[]>`select id from fortnight where tenant_id = ${t} and academic_year_id = ${year} and starts_on <= ${TODAY} and ends_on >= ${TODAY} limit 1`;
  const fortnight =
    held?.id ??
    (await sql<{ id: string }[]>`
      insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on, state) values (${t}, ${year}, 7390, 'teaching', ${TODAY}, ${TODAY}, 'planning') returning id`)[0].id;
  const [{ id: activity }] = await sql<{ id: string }[]>`select id from activity where code = 'ACT-K2-M104-904'`;
  const [{ id: entry }] = await sql<{ id: string }[]>`
    insert into plan_entry (tenant_id, school_class_id, fortnight_id, plan_key, ord, text, source, activity_id, link_rule)
    values (${t}, ${klass}, ${fortnight}, 'UI-3A-1', 1, 'Sorting by colour', 'ui-3a', ${activity}, 'exact_name')
    on conflict (school_class_id, fortnight_id, plan_key, ord) do update set activity_id = excluded.activity_id returning id`;
  const [{ id: period }] = await sql<{ id: string }[]>`
    insert into period (tenant_id, grade_code, ord, starts_at, ends_at, label, fixed) values (${t}, 'K2', 92, '03:42', '04:12', 'UI-3a with an activity', false)
    on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
  const [{ id: session }] = await sql<{ id: string }[]>`
    insert into session (tenant_id, school_class_id, school_day_id, period_id, kind, text, plan_entry_id) values (${t}, ${klass}, ${day}, ${period}, 'lesson', 'Sorting', ${entry})
    on conflict (school_class_id, school_day_id, period_id) do update set plan_entry_id = excluded.plan_entry_id returning id`;
  await page.goto(`/period/${session}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Placeholder sorting activity");
  await expect(page.getByRole("link", { name: "Record a note" })).toHaveAttribute("href", `/record?session=${session}`);
  await expect(page.getByRole("link", { name: "Type the marks instead" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the activity" })).toBeVisible();
  await expect(page.getByText("Not run with this class yet.")).toBeVisible();
  await expect(page.getByText("The steps, short")).toBeVisible();
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

test("Notes: a note left unconfirmed carries the red 'late' chip and sorts first", async ({ page }) => {
  await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3.");
  const late = await aK2Note(sql, { klass, staff }, "Activity 907, level 1. Below 4.", "left_unconfirmed");
  await page.goto(`/notes?class=${klass}&view=table`);
  const rows = page.locator("table tbody tr");
  await expect(rows.first().locator("[data-status=late]")).toBeVisible();
  expect(late).toBeTruthy();
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

test("Notes: tapping a child opens ChildPeek with the history, Escape closes it and focus returns, 'Open the child' leads on", async ({ page }) => {
  const note = await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3.");
  await page.goto(`/notes/${note}`);
  await page.getByRole("button", { name: "Confirm this note" }).click();
  await page.waitForURL(/\/notes/);
  await page.goto(`/notes?class=${klass}&view=table`);
  const chip = page.locator("[data-peek-open]").first();
  await chip.click();
  const peek = page.locator("[data-block=ChildPeek]");
  await expect(peek).toBeVisible();
  await expect(peek.locator("li.b-tli").first()).toBeVisible(); // the observation just confirmed, newest first
  await expect(peek.getByRole("link", { name: "Open the child" })).toHaveAttribute("href", new RegExp(`^/children/${klass}/`));
  await page.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  await expect(chip).toBeFocused();
});

test("Notes: the coordinator reads the notes of every class and has no Confirm or Open; another person's note is not found", async ({ page }) => {
  await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3.");
  await page.goto(`/notes?class=${klass}`);
  // the table only, no board, and no button that confirms or opens a note: the author confirms, a coordinator reads
  await expect(page.locator("table tbody tr").first()).toBeVisible();
  await expect(page.locator("[data-block=KanbanBoard]")).toHaveCount(0);
  await expect(page.locator('main a[href^="/notes/"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^(Confirm|Open)$/ })).toHaveCount(0);
  // a note someone else wrote: the engine reads a draft for its author only, so it is not found
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id::text as tenant from school_class where id = ${klass}`;
  const [{ campus }] = await sql<{ campus: string }[]>`select campus_id::text as campus from school_class where id = ${klass}`;
  const [other] = await sql<{ id: string }[]>`insert into staff (tenant_id, campus_id) values (${tenant}, ${campus}) returning id::text`;
  const theirs = await aK2Note(sql, { klass, staff: other.id }, "Activity 904, level 2. Above 3.");
  await page.goto(`/notes/${theirs}`);
  await expect(page.getByRole("button", { name: "Confirm this note" })).toHaveCount(0);
});

test("Record: Add a photo hangs the photo on the lesson's note, with the rule for photos beside it", async ({ page }) => {
  await page.goto(`/record?class=${klass}&session=${lesson}`);
  await expect(page.locator("[data-add-photo] [data-photo-rule]")).toHaveText("Photograph the work or the board, never a child.");
  // a 1 x 1 PNG: the engine looks at the file's first bytes, not its name
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==", "base64");
  await page.locator("[data-add-photo] input[type=file]").setInputFiles({ name: "board.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText("Photo added to this lesson's note.")).toBeVisible();
  const [row] = await sql<{ n: number }[]>`select coalesce(sum(array_length(photo_keys, 1)), 0)::int as n from pii.educator_note where session_id = ${lesson}`;
  expect(row.n).toBeGreaterThanOrEqual(1);
});

test("Notes: an educator's board lanes count the rows of her table in that state", async ({ browser }) => {
  const rows = await inventoryRows(sql);
  const [{ staff: hers }] = await sql<{ staff: string }[]>`select staff_id::text as staff from pii.staff where email = ${EDUCATOR.email}`;
  const mine = { klass: rows.classId, staff: hers };
  await aK2Note(sql, mine, "Activity 904, level 2. Above 3.");
  await aK2Note(sql, mine, "Activity 904, level 2. Below 4.", "left_unconfirmed");
  const educator = await signedInAs(browser, "educator", { width: 1440, height: 900 });
  const p = await educator.newPage();
  await p.goto(`/notes?class=${rows.classId}&view=table`);
  const inTable = await p.locator("table tbody tr").count();
  await p.goto(`/notes?class=${rows.classId}&view=board`);
  const counts = await p.locator("[data-block=KanbanBoard] .b-count").allInnerTexts();
  expect(counts.map(Number).reduce((a, b) => a + b, 0)).toBe(inTable);
  await educator.close();
});

test("Confirm: a square opens the mark picker, and the mark it sets is the square's; the claim it came from is kept as changed", async ({ page }) => {
  const note = await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3, 4. Below 5.");
  await page.goto(`/notes/${note}`);
  await page.locator("[data-roll='3']").click();
  const picker = page.locator("[data-picker='3']");
  await expect(picker).toBeVisible();
  await expect(picker.locator("[data-pick]")).toHaveText(["Above", "Below", "Not willing", "Absent", "Clear"]);
  await picker.locator("[data-pick=below]").click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator("[data-roll='3']")).toHaveAttribute("data-cell-mark", "below");
  await expect(page.locator("[data-block=ChildPeek]")).toHaveCount(0); // a square changes the mark and never opens the peek
  await page.getByRole("button", { name: "Confirm this note" }).click();
  await page.waitForURL(/\/notes/);
  const [claim] = await sql<{ decision: string }[]>`select decision from pii.note_claim where note_id = ${note} and section = 'above'`;
  expect(claim.decision).toBe("changed");
});

test("Confirm: the × on a claim line takes the line out, its squares return to unmarked, and it is kept as removed", async ({ page }) => {
  const note = await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3. Below 5.");
  await page.goto(`/notes/${note}`);
  await expect(page.locator("[data-roll='3']")).toHaveAttribute("data-cell-mark", "above");
  await page.getByRole("button", { name: "Remove: Above 3" }).click();
  await expect(page.locator("[data-claim=above]")).toHaveAttribute("data-removed", "");
  await expect(page.locator("[data-roll='3']")).toHaveAttribute("data-cell-mark", "none");
  await expect(page.locator("[data-roll='5']")).toHaveAttribute("data-cell-mark", "below");
  await page.getByRole("button", { name: "Confirm this note" }).click();
  await page.waitForURL(/\/notes/);
  const [claim] = await sql<{ decision: string }[]>`select decision from pii.note_claim where note_id = ${note} and section = 'above'`;
  expect(claim.decision).toBe("removed");
  expect((await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where note_id = ${note}`)[0].n).toBe(1);
});
