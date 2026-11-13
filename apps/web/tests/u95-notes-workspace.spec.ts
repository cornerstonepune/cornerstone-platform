/**
 * U95 — Notes as a Workspace (docs/frontend/page-charter.md Part C, "Notes / A note: keep, reshape to Workspace: list left, the note and
 * its marks right"). The list of notes is on the left; choosing one opens it on the right in the DetailPanel, with its marks and the
 * confirm and correct actions working as on its own page; /notes/<id> is that panel opened full page, and its address keeps working.
 * Rows are the spec's own: a K2 class "U95N" (tests/k2-rows.ts) whose children carry the repository's fake first names, an educator of
 * the spec's own who holds it, and notes made as the engine leaves them (drafted, words typed). The voice switch is on only inside the spec.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_FIRST_NAMES, FAKE_STAFF } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { aK2Note, k2Class, noNotesWaiting, voiceSwitch, ROLLS, type K2 } from "./k2-rows";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "U95N";
const EDUCATOR = { email: "u95-educator@cornerstone.test", name: FAKE_STAFF[4], role: "educator", classes: [], subjects: [] };
const first = (roll: string) => FAKE_FIRST_NAMES[(Number(roll) - 1) % FAKE_FIRST_NAMES.length];
let mine: K2;

const as = async (browser: Browser, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const panel = (page: Page) => page.locator("[data-block=DetailPanel]");
const confirmed = (note: string) =>
  expect.poll(async () => (await sql<{ status: string }[]>`select status from pii.educator_note where id = ${note}`)[0].status).toBe("confirmed");

test.beforeAll(async () => {
  const { klass } = await k2Class(sql, SECTION);
  for (const roll of ROLLS)
    await sql`update pii.child set first_name = ${first(roll)} where child_id = (select child_id from enrolment where class_id = ${klass} and roll_no = ${roll} and to_date is null limit 1)`;
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  const [{ staff, tenant }] = await sql<{ staff: string; tenant: string }[]>`select staff_id::text as staff, tenant_id::text as tenant from pii.staff where email = ${EDUCATOR.email}`;
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${tenant}, ${staff}, 'class_teacher', ${klass}, current_date - 1, 'u95 test'
    where not exists (select 1 from staff_role_grant where staff_id = ${staff} and school_class_id = ${klass} and role_code = 'class_teacher')`;
  mine = { klass, staff };
});
test.afterAll(async () => {
  await voiceSwitch(sql, false);
  await sql.end();
});
test.beforeEach(async () => {
  await voiceSwitch(sql, true);
  await noNotesWaiting(sql, mine);
});

test("the list is on the left; with nothing chosen the right side counts the notes by state", async ({ browser }) => {
  await aK2Note(sql, mine, "Activity 904, level 2. Above 3.");
  await aK2Note(sql, mine, "Activity 907, level 1. Below 4.");
  const page = await as(browser);
  await page.goto(`/notes?class=${mine.klass}&view=table`);
  await expect(page.locator("main table tbody tr")).not.toHaveCount(0);
  const summary = page.locator("[data-block=DetailPanel][data-panel=summary]");
  await expect(summary).toBeVisible();
  await expect(summary.locator("[data-stat=to_confirm] .b-stat-n")).toHaveText("2");
  await expect(summary.locator("[data-stat=unconfirmed]")).toBeVisible();
  await expect(summary.locator("[data-stat=confirmed]")).toBeVisible();
  await page.context().close();
});

test("choosing a note opens it on the right with its marks: the address names it, the list stays, Escape closes it and focus returns", async ({ browser }) => {
  const note = await aK2Note(sql, mine, "Activity 904, level 2. Above 3. Below 5.");
  const page = await as(browser);
  await page.goto(`/notes?class=${mine.klass}&view=table`);
  const open = page.locator(`main a[data-open-key="note:${note}"]`);
  await open.click();
  await expect(page).toHaveURL(new RegExp(`[?&]open=note%3A${note}`));
  await expect(panel(page)).toHaveAttribute("data-open", `note:${note}`);
  await expect(page.locator("main table tbody tr").first()).toBeVisible(); // the list is still there, on the left
  await expect(panel(page).getByRole("tab")).toHaveText(["Marks", "Children"]);
  await expect(panel(page).locator("[data-heard] [data-line=above]")).toContainText("Above 3");
  await expect(panel(page).locator("[data-roll='3']")).toHaveAttribute("data-cell-mark", "above");
  await expect(panel(page).locator("[data-roll='5']")).toHaveAttribute("data-cell-mark", "below");
  await expect(panel(page).getByRole("button", { name: "Confirm this note" })).toHaveCount(1);
  await panel(page).getByRole("tab", { name: "Children" }).click();
  await expect(panel(page).locator("[data-named]")).toContainText(first("3"));
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/open=/);
  await expect(page.locator("[data-block=DetailPanel][data-panel=summary]")).toBeVisible();
  await expect(page.locator(`main a[data-open-key="note:${note}"]`)).toBeFocused();
  await page.context().close();
});

test("a card of the board opens its note on the right too", async ({ browser }) => {
  const note = await aK2Note(sql, mine, "Activity 904, level 2. Above 3.");
  const page = await as(browser);
  await page.goto(`/notes?class=${mine.klass}`);
  await page.locator(`[data-block=KanbanBoard] a[data-open-key="note:${note}"]`).click();
  await expect(panel(page)).toHaveAttribute("data-open", `note:${note}`);
  await expect(page.locator("[data-block=KanbanBoard]")).toBeVisible();
  await page.context().close();
});

test("Confirm in the panel writes one observation per marked child and opens the next note waiting beside the list", async ({ browser }) => {
  const note = await aK2Note(sql, mine, "Activity 904, level 2. Above 3. Below 5.");
  const next = await aK2Note(sql, mine, "Activity 904, level 2. Above 9.");
  const page = await as(browser);
  await page.goto(`/notes?class=${mine.klass}&open=note:${note}`);
  await panel(page).getByRole("button", { name: "Confirm this note" }).click();
  await confirmed(note);
  expect((await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where note_id = ${note}`)[0].n).toBe(2);
  expect((await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where note_id = ${next}`)[0].n).toBe(0);
  await expect(page).toHaveURL(new RegExp(`/notes\\?open=note%3A${next}`));
  await expect(panel(page)).toHaveAttribute("data-open", `note:${next}`);
  await page.context().close();
});

test("a confirmed note opens with Correct this note; the correction writes a superseding row and returns to the panel", async ({ browser }) => {
  const note = await aK2Note(sql, mine, "Activity 904, level 2. Above 3.");
  const page = await as(browser);
  await page.goto(`/notes?open=note:${note}`);
  await panel(page).getByRole("button", { name: "Confirm this note" }).click();
  await confirmed(note);
  const [old] = await sql<{ id: string }[]>`select id::text from activity_observation where note_id = ${note} and outcome = 'above' limit 1`;
  await page.goto(`/notes?open=note:${note}`);
  await expect(panel(page).getByRole("button", { name: "Confirm this note" })).toHaveCount(0);
  await panel(page).locator("select[name=observation]").selectOption(old.id);
  await panel(page).locator("select[name=outcome]").selectOption("below");
  await panel(page).locator("input[name=reason]").fill("I misheard the number");
  await panel(page).getByRole("button", { name: "Correct this note" }).click();
  await expect.poll(async () => (await sql`select 1 from activity_observation where supersedes = ${old.id} and reason = 'I misheard the number' and outcome = 'below'`).length).toBe(1);
  expect((await sql<{ outcome: string }[]>`select outcome from activity_observation where id = ${old.id}`)[0].outcome).toBe("above");
  await expect(page).toHaveURL(new RegExp(`/notes\\?open=note%3A${note}&tab=marks`));
  await expect(panel(page)).toHaveAttribute("data-open", `note:${note}`);
  await page.context().close();
});

test("/notes/<id> is the panel opened full page: Open full page leads there, the same tabs, and the tab is in the address", async ({ browser }) => {
  const note = await aK2Note(sql, mine, "Activity 904, level 2. Above 3.");
  const page = await as(browser);
  await page.goto(`/notes?open=note:${note}`);
  await expect(panel(page).locator("[data-panel-full]")).toHaveAttribute("href", `/notes/${note}`);
  await panel(page).locator("[data-panel-full]").click();
  await expect(page).toHaveURL(new RegExp(`/notes/${note}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confirm what the reader heard");
  const full = page.locator("[data-block=DetailPanel][data-inline]");
  await expect(full).toHaveAttribute("data-open", `note:${note}`);
  await expect(full.getByRole("tab")).toHaveText(["Marks", "Children"]);
  await expect(full.locator("[data-panel-close]")).toHaveCount(0); // a page, not a panel: nothing to close
  await page.goto(`/notes/${note}?tab=children`);
  await expect(page.locator("[data-block=DetailPanel]").getByRole("tab", { name: "Children" })).toHaveAttribute("aria-selected", "true");
  await page.context().close();
});

test("at 400 px a chosen note covers the list as a sheet, with no sideways scroll", async ({ browser }) => {
  const note = await aK2Note(sql, mine, "Activity 904, level 2. Above 3.");
  const page = await as(browser, 400);
  await page.goto(`/notes?open=note:${note}`);
  await expect(panel(page).getByRole("button", { name: "Confirm this note" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.context().close();
});
