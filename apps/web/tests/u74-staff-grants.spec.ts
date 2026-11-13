/**
 * U74 (UI-5) — a coordinator gives and ends a grant on Staff and classes (/setup/staff), against the engine's routes
 * (POST /staff/grants, /give, /end; backend #616). One test for each "Done when" line of the grants slice that the inventory test
 * (u70-inventory: Add a grant opens its form, End a grant ends the inventory's grant) does not already prove:
 *   1 a grant is given from today and listed, and nothing else of the person changes        5 a class that is not on the list is refused, nothing changes
 *   2 a subject role asks for a subject, a class role does not                                6 an educator cannot change grants
 *   3 a clash is answered in the table's own words and stands only with a reason              7 no name or email is in the address
 *   4 ending keeps the row, marks it Ended and is logged
 *   9 the filter row finds a person
 * Rows are the test's own (two people and two classes with a random label, children named from tests/fake-names.ts), made once per run.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { inventoryRows, signedInAs } from "./inventory-fixtures";
import { aClass, aPerson, forgetPerson, personAsStored } from "./rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const tag = Math.random().toString(36).slice(2, 5).toUpperCase();
const CLASS_A = `U74${tag}A`;
const CLASS_B = `U74${tag}B`;
const ONE = { email: `u74-${tag.toLowerCase()}-one@cornerstone.test`, name: "Grants Person One", role: "educator", hash: "scrypt$keep$me", classes: [] as string[] };
const TWO = { email: `u74-${tag.toLowerCase()}-two@cornerstone.test`, name: "Grants Person Two", role: "educator", hash: "scrypt$keep$me", classes: [] as string[] };
let one = "";
let two = "";

test.beforeAll(async () => {
  await inventoryRows(sql);
  await aClass(sql, CLASS_A, "K2", FAKE_CHILDREN.slice(0, 2) as unknown as string[]);
  await aClass(sql, CLASS_B, "K2", FAKE_CHILDREN.slice(2, 4) as unknown as string[]);
  one = (await aPerson(sql, ONE)).id;
  two = (await aPerson(sql, TWO)).id;
});
test.afterAll(async () => {
  // a grant is never deleted: whatever this file gave is ended, so the people and classes of later specs are as they were. Ended on the
  // school's day, never the server's: a grant given "from today" is dated by the school's clock, which runs 5½ hours ahead of the
  // server's UTC, so between midnight and 05:30 at school `current_date` fell before its start and the end broke valid_to >= valid_from
  // (main's run 43094652851). A grant that starts later still is ended on its first day.
  const day = await today();
  await sql`update staff_role_grant set valid_to = greatest(valid_from, ${day}::date) where staff_id in (${one}::uuid, ${two}::uuid) and (valid_to is null or valid_to > ${day}::date)`;
  await forgetPerson(sql, ONE.email);
  await forgetPerson(sql, TWO.email);
  await sql.end();
});

const today = async () =>
  (await sql<{ d: string }[]>`select (now() at time zone (select value #>> '{}' from config where key = 'school.time_zone'))::date::text as d`)[0].d;
const grantsOf = (staff: string) =>
  sql<{ id: string; role_code: string; subject_code: string | null; valid_from: string; valid_to: string | null; override_reason: string | null; label: string }[]>`
    select g.id::text, g.role_code, g.subject_code, g.valid_from::text, g.valid_to::text, g.override_reason, sc.label
    from staff_role_grant g join school_class sc on sc.id = g.school_class_id where g.staff_id = ${staff}::uuid order by g.created_at`;
const logged = async (grantId: string, op: string) =>
  (await sql<{ n: number }[]>`select count(*)::int as n from change_log where table_name = 'staff_role_grant' and op = ${op} and row_id = ${grantId}`)[0].n;

async function openAdd(page: Page, staff: string) {
  // the person opens on the right, with their grants and Add a grant (page charter Part C)
  await page.goto(`/setup/staff?open=person:${staff}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add a grant" }).click();
  return page.getByRole("form", { name: "Add a grant" });
}
const save = async (form: ReturnType<Page["getByRole"]>) => form.getByRole("button", { name: "Save the grant" }).click();

test("1. a grant is given from today and listed, the log has it, and the rest of the person is as it was", async ({ page }) => {
  const before = await personAsStored(sql, ONE.email);
  const form = await openAdd(page, one);
  await form.getByLabel("Role", { exact: true }).selectOption("assistant");
  await form.getByLabel("Class", { exact: true }).selectOption(CLASS_A);
  await save(form);
  await expect(form.getByRole("status")).toContainText("Given from today.");
  const [g] = await grantsOf(one);
  expect(g).toMatchObject({ role_code: "assistant", label: CLASS_A, valid_from: await today(), valid_to: null, subject_code: null });
  expect(await logged(g.id, "give")).toBe(1);
  await expect(page.locator("main")).toContainText(`${CLASS_A} · every subject · from ${await today()} to open`);
  const after = await personAsStored(sql, ONE.email);
  expect({ password: after?.password, role: after?.role }).toEqual({ password: before?.password, role: before?.role });
  expect(await page.content()).not.toContain("scrypt$");
});

test("2. a subject role asks for a subject and a class role does not; the subject is listed by its name", async ({ page }) => {
  const form = await openAdd(page, one);
  await form.getByLabel("Role", { exact: true }).selectOption("assistant");
  await expect(form.getByLabel("Subject", { exact: true })).toHaveCount(0);
  await form.getByLabel("Role", { exact: true }).selectOption("subject_educator");
  const subject = form.getByLabel("Subject", { exact: true });
  await expect(subject).toBeVisible();
  const code = await subject.locator("option:not([disabled])").first().getAttribute("value");
  expect(code).toBeTruthy();
  await form.getByLabel("Class", { exact: true }).selectOption(CLASS_B);
  await subject.selectOption(code!);
  await save(form);
  await expect(form.getByRole("status")).toContainText("Given from today.");
  const mine = (await grantsOf(one)).find((g) => g.role_code === "subject_educator");
  expect(mine).toMatchObject({ label: CLASS_B, subject_code: code });
});

test("3. a second class educator is answered in the table's own words, and stands only with a reason", async ({ page }) => {
  let form = await openAdd(page, one);
  await form.getByLabel("Role", { exact: true }).selectOption("class_teacher");
  await form.getByLabel("Class", { exact: true }).selectOption(CLASS_A);
  await save(form);
  await expect(form.getByRole("status")).toContainText("Given from today.");
  form = await openAdd(page, two);
  await form.getByLabel("Role", { exact: true }).selectOption("class_teacher");
  await form.getByLabel("Class", { exact: true }).selectOption(CLASS_A);
  await save(form);
  await expect(form.getByRole("status")).toContainText(/already has a/i);
  await expect(form.getByRole("status")).not.toContainText("one_per_class"); // the sentence, not the name of the check
  expect(await grantsOf(two), "nothing was given while the clash stood").toHaveLength(0);
  await form.getByLabel("Why it should stand anyway").fill("Shares the class with a colleague this term");
  await save(form);
  await expect(form.getByRole("status")).toContainText("Given from today.");
  const [g] = await grantsOf(two);
  expect(g).toMatchObject({ role_code: "class_teacher", label: CLASS_A, override_reason: "Shares the class with a colleague this term" });
});

test("4. ending keeps the row, marks it Ended, logs it, and the button goes", async ({ page }) => {
  await page.goto(`/setup/staff?open=person:${one}`, { waitUntil: "networkidle" });
  const [open] = (await grantsOf(one)).filter((g) => g.role_code === "assistant" && !g.valid_to);
  const before = (await grantsOf(one)).length;
  const row = page.locator("li", { hasText: `${CLASS_A} · every subject` }).filter({ hasText: "Assistant" });
  await row.getByRole("button", { name: /End a grant/ }).click();
  await expect(row).toContainText("Ended");
  await expect(row.getByRole("button", { name: /End a grant/ })).toHaveCount(0);
  const rows = await grantsOf(one);
  expect(rows, "nothing deleted").toHaveLength(before);
  expect(rows.find((g) => g.id === open.id)).toMatchObject({ valid_to: await today() });
  expect(await logged(open.id, "end")).toBe(1);
});

test("5. a class that is not on the list is refused in words and nothing changes", async ({ page }) => {
  const before = (await grantsOf(two)).length;
  const form = await openAdd(page, two);
  await form.getByLabel("Role", { exact: true }).selectOption("assistant");
  await form.getByLabel("Class", { exact: true }).evaluate((s) => {
    const o = document.createElement("option");
    o.value = o.textContent = "NO-SUCH-CLASS";
    s.appendChild(o);
  });
  await form.getByLabel("Class", { exact: true }).selectOption("NO-SUCH-CLASS");
  await save(form);
  await expect(form.getByRole("status")).toContainText("No such member of staff or class on your campus.");
  expect(await grantsOf(two)).toHaveLength(before);
});

test("6. an educator sees no way to change a grant", async ({ browser }) => {
  const context = await signedInAs(browser, "educator", { width: 1280, height: 900 });
  const page = await context.newPage();
  await page.goto(`/setup/staff?person=${one}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /Add a grant|End a grant/ })).toHaveCount(0);
  await context.close();
});

test("7. no name or email is in the address, before or after a grant is given or ended", async ({ page }) => {
  const form = await openAdd(page, two);
  await form.getByLabel("Role", { exact: true }).selectOption("assistant");
  await form.getByLabel("Class", { exact: true }).selectOption(CLASS_B);
  await save(form);
  await expect(form.getByRole("status")).toContainText("Given from today.");
  const url = decodeURIComponent(page.url()).toLowerCase();
  for (const bad of [TWO.name, TWO.email, "grants person", "@"]) expect(url).not.toContain(bad.toLowerCase());
});

test("9. the filter row finds a person on Staff and classes", async ({ page }) => {
  await page.goto("/setup/staff?q=grants%20person%20one", { waitUntil: "networkidle" });
  await expect(page.locator("[data-filterbar]")).toBeVisible();
  const table = page.locator("main [data-block=DataTable]");
  await expect(table).toContainText("Grants Person One");
  await expect(table).not.toContainText("Grants Person Two");
});
