/**
 * U73 (UI-5) — the coordinator's pages: Staff and classes (/setup/staff), Classes and children (/setup/classes) and Setup (/setup).
 * One test for each "Done when" line of issue #520 that the inventory test (u70-inventory) does not already prove; line 1 and 5
 * (the generic checks, every listed control) are the inventory's, and the first test here holds that this slice is in it.
 * Rows are the test's own (a pair of classes with a random label, children named from tests/fake-names.ts), made once per run.
 */
import { expect, test, type Page } from "@playwright/test";
import { menu } from "./menu";
import postgres from "postgres";
import { FAKE_CHILDREN, FAKE_STAFF } from "./fake-names";
import { EDUCATOR, inventoryRows, signedInAs } from "./inventory-fixtures";
import { loadInventory } from "./inventory/load";
import { aClass, forgetPerson } from "./rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const tag = Math.random().toString(36).slice(2, 5).toUpperCase();
const FROM = `U73${tag}A`;
const TO = `U73${tag}B`;
const KIDS = FAKE_CHILDREN.slice(0, 3) as unknown as string[];
const MOVER = KIDS[0];
let fromId = "";
let toId = "";
let moverId = "";

test.beforeAll(async () => {
  await inventoryRows(sql); // the educator
  const kids = await aClass(sql, FROM, "K2", KIDS);
  await aClass(sql, TO, "K2", FAKE_CHILDREN.slice(5, 7) as unknown as string[]);
  moverId = kids[MOVER];
  [{ id: fromId }] = await sql<{ id: string }[]>`select id from school_class where label = ${FROM} order by created_at limit 1`;
  [{ id: toId }] = await sql<{ id: string }[]>`select id from school_class where label = ${TO} order by created_at limit 1`;
});
test.afterAll(async () => {
  await sql.end();
});

const seen = async (page: Page, path: string) => {
  await page.goto(path, { waitUntil: "networkidle" });
  return page.locator("main").innerText();
};

test("1 and 5. this slice is in the inventory, so u70 drives its screens as the coordinator (Across classes joined it as a Dashboard, page charter Part C)", () => {
  const inv = loadInventory();
  expect(inv.merged_slices).toContain("UI-5");
  const ids = inv.slices.find((s) => s.id === "UI-5")!.screens;
  expect(ids.sort()).toEqual(["across", "classes", "setup", "staff"]);
});

test("3 and 6. Staff has nothing that ranks or sorts: no sort link, no aria-sort, no ordinal, no percentage, no grading colour", async ({ page }) => {
  const text = await seen(page, "/setup/staff");
  await expect(page.locator("main table th a")).toHaveCount(0);
  await expect(page.locator("main [aria-sort]")).toHaveCount(0);
  // what the tables show (the page's own sentence says "no score, no ranking", and may)
  const shown = (await page.locator("main table").allInnerTexts()).join("\n");
  expect(shown).not.toMatch(/\b(rank|ranked|top|best|worst|score|1st|2nd|3rd|\d+th)\b/i);
  expect(text).not.toMatch(/\d\s*%/);
  // the order is the role's own, then name: the same however the address asks (a sort asked for is ignored)
  const first = await page.locator("main table tbody tr td:first-child").allInnerTexts();
  await page.goto("/setup/staff?sort=late&dir=desc", { waitUntil: "networkidle" });
  expect(await page.locator("main table tbody tr td:first-child").allInnerTexts()).toEqual(first);
  // a count is not coloured: its cells carry no state colour class or inline colour
  const coloured = await page.locator("main table td.num").evaluateAll((cells) => cells.filter((c) => c.querySelector("[data-state], .chip") || (c as HTMLElement).style.color).length);
  expect(coloured).toBe(0);
});

test("7. a grant is never deleted: the database refuses it and visiting the pages leaves the count as it was", async ({ page }) => {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from staff_role_grant`;
  await seen(page, "/setup/staff");
  await seen(page, "/setup/classes");
  await expect(sql`delete from staff_role_grant`).rejects.toThrow();
  const [{ n: after }] = await sql<{ n: number }[]>`select count(*)::int as n from staff_role_grant`;
  expect(after).toBe(n);
});

test("8. no staff name is shown unless the viewer is in the everything group", async ({ browser, page }) => {
  const [{ name }] = await sql<{ name: string }[]>`select name from pii.staff where email = 'e2e@cornerstone.test'`;
  expect(await seen(page, "/setup/staff")).toContain(name);
  const context = await signedInAs(browser, "educator", { width: 1440, height: 900 });
  const edu = await context.newPage();
  for (const path of ["/setup/staff", "/setup/classes"]) {
    const text = await seen(edu, path);
    for (const n of [name, EDUCATOR.name, ...FAKE_STAFF]) expect(text, `${path} shows ${n} to an educator`).not.toContain(n);
  }
  await context.close();
});

test("4 and 9. a move closes the enrolment, opens a new one, writes the change log and deletes nothing; both classes show it next render", async ({ page }) => {
  const count = async () => {
    const [r] = await sql<{ e: number; open: number; c: number; l: number; ch: number }[]>`
      select (select count(*) from enrolment where child_id = ${moverId})::int as e,
             (select count(*) from enrolment where child_id = ${moverId} and to_date is null)::int as open,
             (select count(*) from child where id = ${moverId})::int as c,
             (select count(*) from change_log where table_name = 'child' and op = 'move' and row_id = ${moverId}::text)::int as l,
             (select count(*) from enrolment)::int as ch`;
    return r;
  };
  const before = await count();
  expect(before.open).toBe(1);
  await page.goto(`/setup/classes?class=${fromId}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: `Move 1 ${MOVER}` }).click();
  await page.getByLabel("To class").selectOption(TO);
  await page.getByLabel("Sr. No. there").fill("9");
  await page.getByRole("button", { name: "Save the move" }).click();
  await page.waitForURL(/moved=1/);
  const after = await count();
  expect(after.e).toBe(before.e + 1); // a new enrolment, the old one kept
  expect(after.open).toBe(1);
  expect(after.c).toBe(1); // the child is not deleted
  expect(after.l).toBe(before.l + 1);
  const [old] = await sql<{ to_date: string | null }[]>`select to_date::text from enrolment where child_id = ${moverId} and class_id = ${fromId}`;
  expect(old.to_date).not.toBeNull();
  const [now] = await sql<{ label: string; roll_no: string }[]>`select section as label, roll_no from child_now where id = ${moverId}`;
  expect(now).toEqual({ label: TO, roll_no: "9" });
  // the class picture of both classes, on the next render
  expect(await seen(page, `/setup/classes?class=${toId}`)).toContain(MOVER);
  expect(await seen(page, `/setup/classes?class=${fromId}`)).not.toContain(MOVER);
});

test("10 and 11. each child row shows the name beside the Sr. No.; the address and the log carry no name; the log lists the move with who and when", async ({ page }) => {
  await page.goto(`/setup/classes?class=${toId}`, { waitUntil: "networkidle" });
  const row = page.locator("main table tbody tr").filter({ hasText: MOVER });
  await expect(row.locator("td").first()).toContainText(`9 ${MOVER}`);
  expect(page.url()).not.toContain(MOVER.split(" ")[0]);
  // the change log is the class panel's Moves tab (page charter Part C: the class opens on the right)
  await page.locator("[data-block=DetailPanel]").getByRole("tab", { name: "Moves" }).click();
  const log = await page.locator("[data-moves]").innerText();
  expect(log).toMatch(new RegExp(`Sr. No. 9 moved from ${FROM} to ${TO}\\. By .+ · \\d{1,2}-[A-Z][a-z]{2}\\.`)); // who, and the day as the wireframe writes it (11-Nov)
  for (const n of FAKE_CHILDREN) expect(log).not.toContain(n);
  const [stored] = await sql<{ t: string }[]>`select (before::text || after::text || coalesce(reason, '') || coalesce(origin, '')) as t from change_log where table_name = 'child' and op = 'move' and row_id = ${moverId}::text`;
  for (const n of FAKE_CHILDREN) expect(stored.t).not.toContain(n);
});

test("12. every setup page is two clicks from the menu", async ({ page }) => {
  // the setup pages are each one line of the sidebar's School section (page charter A1); the Setup page's own cards still lead to them
  await page.goto("/today", { waitUntil: "networkidle" });
  const school = (await menu(page)).getByRole("list", { name: "School" });
  for (const [line, title] of [["Staff", "Staff and classes"], ["Classes", "Classes and children"]] as const) {
    await school.getByRole("link", { name: line, exact: true }).click();
    await expect(page.locator("h1")).toHaveText(title);
  }
  await page.goto("/setup", { waitUntil: "networkidle" });
  await expect(page.locator("h1")).toHaveText("Setup");
  for (const [card, title] of [["Open Staff", "Staff and classes"], ["Open Classes and children", "Classes and children"]] as const) {
    await page.locator("main").getByRole("link", { name: card, exact: true }).click();
    await expect(page.locator("h1")).toHaveText(title);
    await page.goBack();
    await expect(page.locator("h1")).toHaveText("Setup");
  }
});

test("13. an educator sees only the cards their group may open", async ({ browser, page }) => {
  const names = async (p: Page) => (await p.locator("main [data-block=Cards] a").allInnerTexts()).map((t) => t.trim());
  await page.goto("/setup", { waitUntil: "networkidle" });
  expect(await names(page)).toEqual(expect.arrayContaining(["Open Staff", "Open Classes and children", "Open Skills to approve"]));
  const context = await signedInAs(browser, "educator", { width: 1440, height: 900 });
  const edu = await context.newPage();
  await edu.goto("/setup", { waitUntil: "networkidle" });
  const theirs = await names(edu);
  for (const hidden of ["Open Staff", "Open Classes and children", "Open Skills to approve"]) expect(theirs).not.toContain(hidden);
  expect(theirs).toContain("Open Question bank");
  await context.close();
});

test("14. the Staff counts are the engine's whole numbers for the person's notes, in a column each, and never a percentage, a score or a rank", async ({ page }) => {
  // the educator the inventory made is given two notes confirmed, one left unconfirmed and four decided lines (two accepted, one changed, one
  // removed); notes are kept for ever, so the test reads the counts before and after and holds the difference
  const [who] = await sql<{ staff_id: string; tenant_id: string }[]>`select staff_id, tenant_id from pii.staff where email = ${EDUCATOR.email}`;
  const read = async () => {
    const text = await seen(page, "/setup/staff");
    const row = page.locator("main table tbody tr").filter({ hasText: EDUCATOR.name });
    // the person's own table (the rows are grouped by role, one table each); a heading is read as the words, not as the capitals it is drawn in
    const head = (await row.locator("xpath=ancestor::table//th").allTextContents()).map((t) => t.trim().toLowerCase());
    const cell = async (label: string) => {
      const at = head.indexOf(label.toLowerCase());
      return at < 0 ? "" : (await row.locator("td").nth(at).innerText()).trim();
    };
    const num = (t: string) => (/^\d+$/.test(t) ? Number(t) : 0);
    const [x, y, z] = ((await cell("Lines accepted / changed / removed")).match(/^(\d+) \/ (\d+) \/ (\d+)$/) ?? ["", "0", "0", "0"]).slice(1).map(Number);
    const tables = (await page.locator("main table").allInnerTexts()).join("\n");
    return { text, tables, head, confirmed: num(await cell("Notes confirmed")), late: num(await cell("Notes late")), lines: [x, y, z] };
  };
  const before = await read();
  const tag14 = `u73-${Date.now()}`;
  const note = async (status: string, n: number) => {
    const [r] = await sql<{ id: string }[]>`insert into pii.educator_note (tenant_id, staff_id, class_id, audio_key, status) values (${who.tenant_id}, ${who.staff_id}, ${fromId}, ${`${tag14}-${n}`}, ${status}) returning id`;
    return r.id;
  };
  const a = await note("confirmed", 1);
  await note("confirmed", 2);
  await note("left_unconfirmed", 3);
  let at = 0;
  for (const [decision, kept] of [["accepted", null], ["accepted", null], ["changed", "words kept"], ["removed", null]] as const) {
    await sql`insert into pii.note_claim (tenant_id, note_id, section, read_as, words, span_start, span_end, decision, kept_as, decided_by) values (${who.tenant_id}, ${a}, 'Maths', 'read', 'words', ${at}, ${at + 1}, ${decision}, ${kept}, ${who.staff_id})`;
    at += 2;
  }
  const after = await read();
  expect(after.head).toEqual(expect.arrayContaining(["notes confirmed", "notes late", "lines accepted / changed / removed"]));
  expect(after.confirmed - before.confirmed).toBe(2);
  expect(after.late - before.late).toBe(1);
  expect(after.lines.map((n, i) => n - before.lines[i])).toEqual([2, 1, 1]);
  expect(after.text).not.toMatch(/\d\s*%/);
  // the page says "no score, no ranking", so the sentence is allowed; a rank, a score or an accuracy as a thing the tables show is not
  expect(after.tables).not.toMatch(/\b(rank|ranked|score|scored)\b|accuracy/i);
});

test("15. Add a person refuses a second add of the same email and a missing name, in words, and the address carries no name", async ({ page }) => {
  const email = `u73-${Date.now()}@cornerstone.test`;
  const add = async (name: string, address: string) => {
    await page.goto("/setup/staff", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Add a person" }).click();
    const form = page.getByRole("form", { name: "Add a person" });
    await form.getByLabel("Name").fill(name);
    await form.getByLabel("School email").fill(address);
    await form.getByRole("button", { name: "Add and send a link" }).click();
    await page.waitForURL(/\/setup\/staff\?(added|refused)=/);
  };
  try {
    await add("Fake Newcomer", email);
    await expect(page.getByRole("main")).toContainText("a link to set their own password is on its way");
    expect(page.url()).not.toContain("Newcomer");
    await add("Fake Newcomer", email);
    await expect(page.getByRole("main")).toContainText("Nobody was added: that email is already on the staff list");
    await add("Fake Other", "nobody@localhost"); // the browser accepts it; the school wants a full address
    await expect(page.getByRole("main")).toContainText("Nobody was added: a name and a school email are both needed");
    // the person is on the list once, with no password
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from pii.staff where email = ${email}`;
    expect(n).toBe(1);
  } finally {
    await forgetPerson(sql, email); // taken off the list, as the other specs do; the rows are kept
  }
});
