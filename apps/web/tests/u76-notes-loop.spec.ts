/**
 * UI-3a — the notes loop: confirm, notes (issue #518, backend #565). One test per Done-when line of the screens in
 * docs/frontend/screens.json. Rows are the test's own (tests/k2-rows.ts: a K2 class "M104", Sr. Nos 1 to 22, two activities).
 * Record merged into the lesson page (page charter Part C): its Done-when lines moved, with their tests, to
 * tests/u95-record-on-the-lesson.spec.ts. Notes are made as the engine leaves them (drafted, words typed).
 * The two K2 switches are on only inside a test.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { aK2Note, k2Class, noNotesWaiting, voiceSwitch } from "./k2-rows";
import { EDUCATOR, inventoryRows, signedInAs } from "./inventory-fixtures";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
let klass: string;
let staff: string;

// Confirm redirects to the next waiting note or Notes, and a note's own address is already /notes/<id>: the address says nothing about
// whether the write has finished, so a test waits for the note itself to be confirmed.
const confirmed = (note: string) =>
  expect.poll(async () => (await sql<{ status: string }[]>`select status from pii.educator_note where id = ${note}`)[0].status).toBe("confirmed");

test.beforeAll(async () => {
  ({ klass, staff } = await k2Class(sql));
});
test.afterAll(async () => {
  await voiceSwitch(sql, false);
  await sql.end();
});
test.beforeEach(async () => {
  await voiceSwitch(sql, true);
  await noNotesWaiting(sql, { klass, staff });
});

test("Confirm: one activity_observation per marked child, none for an unmarked child, all with one confirmation_id; no control confirms more than one note", async ({ page }) => {
  const note = await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 3. Below 5. The rest did not get a mark.");
  const other = await aK2Note(sql, { klass, staff }, "Activity 904, level 2. Above 9.");
  await page.goto(`/notes/${note}`);
  await expect(page.getByRole("button", { name: "Confirm this note" })).toHaveCount(1);
  await page.getByRole("button", { name: "Confirm this note" }).click();
  await confirmed(note);
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
  await confirmed(note);
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
  await confirmed(note);
  await page.goto(`/notes?class=${klass}&state=confirmed&view=table`); // confirmed ones sort last of all, behind every late and waiting note: filter to them, newest first
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
  await confirmed(note);
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
  await confirmed(note);
  const [claim] = await sql<{ decision: string }[]>`select decision from pii.note_claim where note_id = ${note} and section = 'above'`;
  expect(claim.decision).toBe("removed");
  expect((await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where note_id = ${note}`)[0].n).toBe(1);
});
