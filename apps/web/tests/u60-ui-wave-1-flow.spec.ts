/**
 * UI wave 1 — an educator's week, walked page by page at 1440 px (goals/ui-wave-1.yaml). Nimish, 23 Oct 2026:
 * "just go ahead and build the whole flow and get it live properly - only when I see it and interact with it on the
 * dashboard can I suggest changes."
 *
 * Today → Assessments (upload box on top, one count per assessment, filters) → Print and give →
 * Upload papers → Marking (the papers read) → Class results → the assessment screen → Curriculum (Maths,
 * then English) → Staff and School. On every page: each table's head sits over its columns, a status is an icon and a
 * word, a filter row is there, every row opens something, and nothing says "This page could not load". A class of the
 * test's own, three children and four papers, is kept (evidence is append-only), as the other specs' are.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { aClass, aReadPaper, aPerson } from "./rows";
import { voiceSwitch } from "./k2-rows";
import { createHmac } from "node:crypto";
import { isoWeek } from "../lib/week";
import { menu, sectionNames, SECTIONS } from "./menu";

test.use({ viewport: { width: 1440, height: 900 } });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SECTION = "WV1-CLASS";
const THIS = isoWeek();
const QR = { asha: "CSF10A01", bina: "CSF10B02", chetan: "CSF10C03", spare: "CSF10D04" };
let kids: Record<string, string> = {};

test.beforeAll(async () => {
  kids = await aClass(sql, SECTION, "G2", ["Asha", "Bina", "Chetan", "Dev"]);
  const [{ tenant }] = await sql<{ tenant: string }[]>`select tenant_id as tenant from child_now where id = ${kids.Asha}`;
  const ws = await sql<{ id: string; item_ids: string[]; skill: string }[]>`
    select id, item_ids, skill_set_code as skill from sheet_template
    where source = 'library' and retired_at is null and band = 'G2'
      and skill_set_code = (select skill_set_code from sheet_template where source = 'library' and retired_at is null
                            and band = 'G2' and difficulty = 'Hard' order by skill_set_code limit 1)
      and difficulty in ('Medium', 'Hard')
    order by difficulty = 'Hard' desc, code limit 4`;
  if (ws.length < 4) throw new Error(`the flow needs four library worksheets of one Grade 2 skill set; the database has ${ws.length}`);
  const paper = (qr: string, w: string, child: string | null, status: string) => sql`
    insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, week, section, kind, print_status, approved_by, approved_at)
    select ${tenant}, ${qr}, ${w}, ${child}, to_date(${THIS}, 'IYYY-"W"IW'), ${SECTION}, 'assessment', ${status},
           ${status === "new" ? null : "wv1"}, ${status === "new" ? null : sql`now()`}
    where not exists (select 1 from sheet_instance where qr_code = ${qr})`;
  await paper(QR.asha, ws[0].id, kids.Asha, "printed");
  await paper(QR.bina, ws[1].id, kids.Bina, "printed");
  await paper(QR.chetan, ws[2].id, kids.Chetan, "new");
  await paper(QR.spare, ws[3].id, null, "new");
  // Bina's copy is read: one answer is right, one waits for a person to say what the child wrote
  await aReadPaper(sql, {
    qr: QR.bina,
    child: kids.Bina,
    template: ws[1].id,
    items: ws[1].item_ids.slice(0, 2),
    reads: [{ status: "correct", read: "1" }, { status: "needs_teacher", read: "7" }],
  });
  await sql`delete from prescription where child_id in ${sql(Object.values(kids))} and week = to_date(${THIS}, 'IYYY-"W"IW')`;
  const sheet = async (qr: string) => (await sql<{ id: string }[]>`select id from sheet_instance where qr_code = ${qr}`)[0].id;
  for (const [who, level, qr] of [
    ["Asha", "Hard", QR.asha],
    ["Bina", "Hard", QR.bina],
    ["Chetan", "Medium", QR.chetan],
    ["Dev", "Hard", null],
  ] as const) {
    await sql`
      insert into prescription (tenant_id, child_id, week, kind, skill_set_code, difficulty, rule_fired, strand, sheet_instance_id, no_paper, created_at)
      values (${tenant}, ${kids[who]}, to_date(${THIS}, 'IYYY-"W"IW'), 'assessment', ${ws[0].skill}, ${level}, 'band_default', 'NUM',
              ${qr ? await sheet(qr) : null}, ${qr ? null : "has sat every worksheet at Hard (4)"}, now() - interval '1 day')`;
  }
});
test.afterAll(async () => {
  await sql.end();
});

// An educator mapped to one class and one subject (goals/nav_teacher_scope_and_todo.yaml): signed in as the site signs one in.
const EDUCATOR = { email: "wv1-educator@cornerstone.test", name: "Wave Educator", role: "educator", classes: [SECTION], subjects: ["NUM"] };
test.beforeAll(async () => {
  await aPerson(sql, EDUCATOR);
});
async function asEducator(browser: import("@playwright/test").Browser) {
  const body = `${Buffer.from(EDUCATOR.email).toString("base64url")}.${Date.now() + 3_600_000}`;
  const mac = createHmac("sha256", process.env.E2E_AUTH_SECRET!).update(body).digest("hex");
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: `${body}.${mac}`, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return { context, page: await context.newPage() };
}

/** The frame (UI-13, page charter A1): the school's mark in the bar, and the menu a sidebar at the left, under the bar, grouped by the
 *  educator's jobs (School the coordinator's); the main column starts right after it. */
async function theBar(page: Page, sections: readonly string[]) {
  await expect(page.locator("header picture[data-brand-mark] img"), "the school's logo").toBeVisible();
  const nav = await menu(page);
  expect(await sectionNames(nav)).toEqual([...sections]);
  const side = (await page.locator("[data-sidebar]").boundingBox())!;
  expect(side.x, "the sidebar is at the left").toBe(0);
  expect(side.y, "under the bar").toBeGreaterThanOrEqual(64);
  const main = (await page.getByRole("main").boundingBox())!;
  expect(main.x - (side.x + side.width), "the content starts right after the sidebar").toBeLessThan(8);
}

test("an educator with one class and one subject: top menu, only hers, no Class or Subject boxes, no approve-all", async ({ browser }) => {
  const { context, page } = await asEducator(browser);
  await open(page, "/today", /Today/);
  await theBar(page, SECTIONS.educator);
  await expect(page.locator("#bar-subject, #bar-class, [data-viewing]"), "no universal Class or Subject selector").toHaveCount(0);
  // the bar carries sign out; the sidebar has the pages
  await expect(page.locator("[data-bar]").first().getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.goto("/children/assessments");
  const nav = await menu(page);
  for (const name of ["Assessments", "Parent reports"]) await expect(nav.getByRole("link", { name, exact: true }), name).toBeVisible();
  // Today's waiting on you (What needs doing, merged in): a row per kind of work, opening a table of red/amber/green tasks, one action on each
  await page.goto("/today");
  const firstRow = page.locator("[data-waiting] [data-row^='group-'] a[data-wait-open]").first();
  await page.goto((await firstRow.getAttribute("href"))!);
  const rows = page.locator("[data-block=DetailPanel] .data-table tbody tr[data-kind]");
  expect(await rows.count(), "rows of tasks").toBeGreaterThan(0);
  for (const row of await rows.all()) {
    await expect(row.locator("[data-status]"), "a priority chip with its icon").toHaveCount(1);
    await expect(row.locator("[data-action]"), "one action").toHaveCount(1);
  }
  expect(await page.locator("tr[data-state=doNow]").count(), "a red row first").toBeGreaterThan(0);
  expect(await page.locator("tr[data-state=doNow]").first().evaluate((el) => el.closest("table")!.querySelector("tbody tr")?.getAttribute("data-state"))).toBe("doNow");
  await expect(page.getByRole("button", { name: /approve (all|them|these|every)/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /approve (all|them|these|every)/i })).toHaveCount(0);
  // only her class: no row names another class's paper
  const where = await page.locator("td[data-label=Where]").allInnerTexts();
  expect(where.filter((w) => /·\s*\d[A-Z]\b/.test(w) && !w.includes(SECTION)), "rows of another class").toEqual([]);
  const first = page.locator("tr[data-kind]:not([data-kind=taught]) a[data-action]").first();
  const href = (await first.getAttribute("href"))!;
  await first.click();
  await expect(page).toHaveURL(new RegExp(href.split("?")[0].replace(/[/]/g, "\\/")));
  await expect(page.getByText("This page could not load")).toHaveCount(0);
  await context.close();
});

test("an admin: the same top menu, and no Viewing control", async ({ page }) => {
  await open(page, "/today", /Today/);
  await theBar(page, SECTIONS.coordinator);
  await expect(page.locator("[data-viewing], #bar-subject, #bar-class")).toHaveCount(0);
  // every page of the menu is in the sidebar, under its section, in the charter's order; nothing more sits in the bar
  await page.goto("/children/assessments");
  const nav = await menu(page);
  await expect(nav.getByRole("list", { name: "Children" }).getByRole("link")).toHaveText(["Class picture", "Parent reports"]);
  await expect(nav.getByRole("list", { name: "Assessments" }).getByRole("link")).toHaveText(["Assessments", "Question bank"]);
  await expect(nav.getByRole("list", { name: "School" }).getByRole("link")).toHaveText(["Across classes", "Curriculum", "Skills to approve", "Staff", "Classes", "Timetable rules", "How it works"]);
  await expect(page.locator("[data-bar]").first().getByRole("navigation")).toHaveCount(0);
});

/** The page opened, with nothing broken on it. */
async function open(page: Page, path: string, title: RegExp) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} answers`).toBeLessThan(400);
  await expect(page.getByRole("heading", { level: 1 }).first(), `${path}: its title`).toHaveText(title);
  await expect(page.getByText("This page could not load"), `${path} loads`).toHaveCount(0);
}

/** Every table on the page: the head over its columns, and a way into every row. */
async function tablesRead(page: Page, path: string) {
  const tables = page.locator(".data-table table");
  const n = await tables.count();
  expect(n, `${path}: a table`).toBeGreaterThan(0);
  for (let t = 0; t < n; t++) {
    const table = tables.nth(t);
    if (!(await table.isVisible())) continue; // behind a fold the educator has not opened
    const name = `${path} “${await table.getAttribute("aria-label")}”`;
    const heads = table.locator(":scope > thead > tr > th");
    const body = table.locator(":scope > tbody > tr:not(.under)");
    const rows = await body.count();
    if (rows === 0) continue;
    const first = body.first().locator(":scope > td");
    expect(await first.count(), `${name} table ${t}: a cell under each heading`).toBe(await heads.count());
    // a heading is never split inside a word: one wider than its column would overflow it
    const cramped = await heads.evaluateAll((hs) => hs.filter((h) => h.scrollWidth > h.clientWidth + 1).map((h) => h.textContent));
    expect(cramped, `${name}: headings that do not fit their column`).toEqual([]);
    for (let c = 0; c < (await heads.count()); c++) {
      const h = await heads.nth(c).boundingBox();
      const d = await first.nth(c).boundingBox();
      if (!h || !d) continue; // a column hidden on this width has neither
      expect(Math.abs(h.x - d.x), `${name} table ${t} column ${c}: heading and cell start together (${h.x},${h.width} vs ${d.x},${d.width})`).toBeLessThan(2);
      expect(Math.abs(h.width - d.width), `${name} table ${t} column ${c}: heading and cell are as wide`).toBeLessThan(2);
    }
    for (let r = 0; r < rows; r++) {
      const row = body.nth(r);
      expect(await row.locator("a[href], button, input, select").count(), `${name} table ${t} row ${r}: opens something`).toBeGreaterThan(0);
    }
  }
}

/** A status is an icon and a word. */
async function statusesSaid(page: Page, path: string) {
  const chips = page.locator("[data-status]:visible");
  const n = Math.min(await chips.count(), 40);
  for (let i = 0; i < n; i++) {
    const chip = chips.nth(i);
    await expect(chip.locator("svg[data-icon]"), `${path}: a status has its icon`).toHaveCount(1);
    expect(((await chip.innerText()) ?? "").trim().length, `${path}: a status has its word`).toBeGreaterThan(1);
  }
}

async function wholePage(page: Page, path: string, title: RegExp, { filter = true, chips = false } = {}) {
  await open(page, path, title);
  await tablesRead(page, path);
  if (filter) await expect(page.locator("[data-filterbar]").first(), `${path}: a filter row`).toBeVisible();
  if (chips) {
    expect(await page.locator("[data-status]:visible").count(), `${path}: a status somewhere`).toBeGreaterThan(0);
    await statusesSaid(page, path);
  }
}

test("Today, with what waits, opens, and its first action leads on", async ({ page }) => {
  await open(page, "/today?open=wait:group-taught", /Today/);
  await expect(page.locator("[data-ux=action] a, [data-ux=action] button").first()).toBeVisible();
  await tablesRead(page, "/today?open=wait:group-taught");
  await expect(page.locator("[data-filterbar]").first()).toBeVisible();
});

test("Assessments: Make an assessment on top, one row per assessment, filters", async ({ page }) => {
  await wholePage(page, "/children/assessments?view=table", /Assessments/, { chips: true });
  const make = await page.locator("[data-make]").boundingBox();
  const table = await page.locator(".data-table").first().boundingBox();
  expect(make && table && make.y < table.y, "the primary action is above the table").toBe(true);
  // the filter row chooses the class; one count per assessment: the week's is one row, not one per child
  await page.locator("[data-filterbar] select[name=class]").selectOption(SECTION);
  await expect(page).toHaveURL(new RegExp(`class=${SECTION}`));
  await expect(page.locator("tr[data-assessment]")).toHaveCount(1);
  await page.getByRole("link", { name: /clear/i }).first().click();
  await expect(page).not.toHaveURL(/class=/);
});

test("Print and give: the classes as a table, a class's children as a table", async ({ page }) => {
  await wholePage(page, "/make", /Home assessments/, { chips: true });
  await wholePage(page, `/make/${SECTION}`, /./, { chips: true });
});

// The Upload papers page is retired (page charter B6): papers are uploaded on an assessment's Upload tab, the files read are the Reading view
test("Uploading papers, and the papers read", async ({ page }) => {
  await wholePage(page, `/children/assessments?class=${SECTION}&view=table`, /Assessments/, { chips: true });
  await page.goto(`/children/assessments?class=${SECTION}`);
  await expect(page.getByText("This page could not load")).toHaveCount(0);
  await page.locator("[data-kcard]").first().click();
  await page.locator("[data-block=DetailPanel]").getByRole("tab", { name: "Upload" }).click();
  await expect(page.locator("[data-block=DetailPanel]").getByLabel("Choose scans")).toHaveCount(1);
});

test("Class results, its class and a child", async ({ page }) => {
  await voiceSwitch(sql, true);
  // a class's topics, a topic opened (goals/res_results_by_topic.yaml); this class has nothing signed off yet, so its
  // skills are named once as not assessed. Its children, one by one, each in a status chip, and a child opened.
  const [{ id: classId }] = await sql<{ id: string }[]>`select id from school_class where label = ${SECTION} limit 1`;
  await wholePage(page, `/children/${classId}?view=topic`, /Class picture/, { chips: false, filter: false });
  await page.locator("tr[data-topic]").first().getByRole("link").first().click();
  await expect(page.getByText("This page could not load")).toHaveCount(0);
  await page.getByRole("link", { name: "Show as a table" }).click();
  // the old list of children is the Children screen (UI-3b): a child opens from its peek
  await expect(page).toHaveURL(/\/children\?cls=[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: /Bina/ }).first().click();
  await page.getByRole("link", { name: "Open the child" }).click();
  await expect(page.getByText("This page could not load")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("Bina");
});

test("the assessment screen, opened from its row", async ({ page }) => {
  await page.goto(`/children/assessments?class=${SECTION}&view=table`);
  const row = page.locator("a[data-assessment-row]").first();
  const href = (await row.getAttribute("href"))!;
  await row.click();
  // the assessment's own screen, its copies drawn, before its tables are read (not the list still on screen)
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.?]/g, "\\$&")}$`));
  await expect(page.locator('section[aria-label$=" copies"]:not([data-spares]) table').first()).toBeVisible();
  await expect(page.getByText("This page could not load")).toHaveCount(0);
  await tablesRead(page, "assessment");
  await statusesSaid(page, "assessment");
});

test("Curriculum, Maths then English, and Staff and School", async ({ page }) => {
  await wholePage(page, "/setup/curriculum/skills", /Curriculum/, { chips: true });
  const maths = await page.locator(".data-table tbody tr").count();
  expect(maths).toBeGreaterThan(0);
  // the filter row says the subject too: its rows are that subject's alone
  await page.locator("[data-filterbar] select[name=subject]").selectOption("English");
  await expect(page).toHaveURL(/subject=English/);
  await expect(page.getByRole("columnheader", { name: "Subject" })).toBeVisible();
  const column = (await page.locator(".data-table thead th").allInnerTexts()).findIndex((h) => h.trim().toLowerCase() === "subject");
  expect(column, "the table has a Subject column").toBeGreaterThanOrEqual(0);
  const cells = await page.locator(`.data-table tbody tr:not(.under) td:nth-child(${column + 1})`).allInnerTexts();
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) expect(cell.trim()).toBe("English");
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(/Curriculum/);
  await expect(page.getByText("This page could not load")).toHaveCount(0);
  await tablesRead(page, "/ (English)");
  await wholePage(page, "/setup/staff", /Staff and classes/);
  await wholePage(page, "/setup/classes", /Classes and children/, { filter: false });
});

test("the flow is one chain: each page's next step opens the following page", async ({ page }) => {
  const chain = ["/today", "/children/assessments"];
  for (const path of chain) {
    await page.goto(path);
    await expect(page.getByText("This page could not load"), path).toHaveCount(0);
    const next = page.locator("[data-ux=next]");
    await expect(next, `${path}: one next step, never a dead end`).toHaveCount(1);
    const href = (await next.getAttribute("href"))!;
    const to = new URL(href, page.url());
    // the queue of answers to check goes on to the next answer, on the same page; every other page goes to another
    expect(`${to.pathname}${to.search}`, `${path}: its next step is somewhere else`).not.toBe(path);
    const res = await page.goto(href);
    expect(res?.status(), `${path} → ${href}`).toBeLessThan(400);
    await expect(page.getByText("This page could not load"), href).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 }).first(), `${path} → ${href}: a page with a title`).toBeVisible();
  }
});
