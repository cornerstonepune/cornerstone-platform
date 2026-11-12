/**
 * U80 (issue #691, and #690 step A) — the Timetable for every fortnight, and the menu without its dead tabs.
 *  - The coordinator opens any fortnight in any state, read-only: a fortnight still in planning shows its grid, its state said in words
 *    ("Drafted: not live yet"), a Live section and a Planning section, and a fortnight picker that reaches every fortnight. Never a 404,
 *    and no Go live anywhere on the page.
 *  - An educator sees only what is live: with nothing live, a plain page says so, never "not found".
 *  - The menu's tabs that led nowhere (Your day, This week) are gone, and the Timetable door opens the Timetable.
 * The class "U74" and its year are the timetable specs' own (tests/timetable-rows.ts); fortnights 7403 (planning, lessons every school
 * day) and 7404 (planning, nothing placed) are this spec's, placed after every fortnight the other specs make. Local copy only; the
 * switch is put back as it was. Nothing here presses Go live or changes a fortnight's state.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { GROUPS } from "../lib/menu";
import { timetableSwitch } from "./educator-screens";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";
import { timetableRows, type Fixture } from "./timetable-rows";
import { doorPages } from "./door-pages";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const COORDINATOR = { email: "u80-coordinator@cornerstone.test", name: "Timetable Coordinator Eighty", role: "coordinator", classes: [], subjects: [] };
const EDUCATOR = { email: "u80-educator@cornerstone.test", name: "Timetable Educator Eighty", role: "educator", classes: [], subjects: ["NUM"] };
const PLANNED = 7403;
const EMPTY = 7404;
const GRID = "[data-block=FortnightGrid]";
const NOT_FOUND = "This page could not be found.";
let f: Fixture;
let wasOn = false;

/** A teaching fortnight of the U74 year, `offset` days after the fixture's Monday, in planning; with lessons on every school day when `placed`. */
async function planningFortnight(number: number, offset: number, placed: boolean) {
  const [{ monday }] = await sql<{ monday: string }[]>`select (date_trunc('week', (now() at time zone 'Asia/Kolkata')::date)::date)::text as monday`;
  const [{ campus }] = await sql<{ campus: string }[]>`select campus_id as campus from school_class where id = ${f.klass}`;
  await sql`
    insert into fortnight (tenant_id, academic_year_id, number, kind, starts_on, ends_on, state)
    values (${f.tenant}, ${f.year}, ${number}, 'teaching', ${monday}::date + ${offset}::int, ${monday}::date + ${offset + 11}::int, 'planning')
    on conflict (tenant_id, academic_year_id, starts_on) do update set number = ${number}, kind = 'teaching', ends_on = excluded.ends_on, state = 'planning'`;
  if (!placed) return;
  for (let i = 0; i < 12; i++) {
    const [d] = await sql<{ on: string; dow: number }[]>`select (${monday}::date + ${offset + i}::int)::text as on, extract(isodow from ${monday}::date + ${offset + i}::int)::int as dow`;
    if (d.dow > 5) continue;
    const [day] = await sql<{ id: string }[]>`
      insert into school_day (tenant_id, campus_id, on_date, kind) values (${f.tenant}, ${campus}, ${d.on}::date, 'teaching')
      on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
    for (const p of f.periods)
      await sql`
        insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text)
        values (${f.tenant}, ${f.klass}, ${day.id}, ${p.id}, ${p.subject}, 'subject', 'planned', true, ${`${p.subject} lesson`})
        on conflict (school_class_id, school_day_id, period_id) do nothing`;
  }
}

/** The lessons of the U74 class in fortnight `number`, counted from the rows (fixed parts of the day are not lessons). */
async function lessonsIn(number: number): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from session s join school_day d on d.id = s.school_day_id
    join fortnight g on g.academic_year_id = ${f.year} and g.number = ${number} and d.on_date between g.starts_on and g.ends_on
    where s.school_class_id = ${f.klass} and s.kind <> 'fixed'`;
  return r.n;
}

const as = async (browser: Browser, email: string): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};

test.beforeAll(async () => {
  f = await timetableRows(sql);
  await planningFortnight(PLANNED, 56, true);
  await planningFortnight(EMPTY, 70, false);
  for (const p of [COORDINATOR, EDUCATOR]) if (!(await personAsStored(sql, p.email))) await aPerson(sql, p);
  // the educator holds the class as cover (the roles the timetable reads: educator.timetable_roles)
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${f.tenant}, ps.staff_id, 'cover_educator', ${f.klass}, current_date - 3, 'u80 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${f.klass} and g.role_code = 'cover_educator')`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, false); // as live today: no timetable is switched on for educators
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

test("the coordinator opens a fortnight still in planning: its grid, its state in words, Live and Planning, and no Go live", async ({ browser }) => {
  const page = await as(browser, COORDINATOR.email);
  const res = await page.goto(`/timetable?class=${f.klass}&fn=${PLANNED}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Timetable", level: 1 })).toBeVisible();
  await expect(page.locator("[data-fortnight-state=planning]")).toContainText("Drafted: not live yet");
  // the grid is the fortnight's: as many lesson cells as the rows hold, two weeks of five days
  const lessons = await lessonsIn(PLANNED);
  expect(lessons).toBe(30); // ten school days, three lessons each
  await expect(page.locator(`${GRID} .b-dh`)).toHaveCount(10);
  await expect(page.locator(`${GRID} a.b-cell`)).toHaveCount(lessons);
  // Live: nothing is live while the switch is off; Planning: this fortnight, its state, its lessons as a whole count
  await expect(page.locator("[data-section=live] [data-nothing-live]")).toContainText("Nothing is live yet.");
  const row = page.locator(`[data-section=planning] [data-planning-fortnight="${PLANNED}"]`);
  await expect(row).toContainText("Drafted: not live yet");
  await expect(row).toContainText(`${lessons} lessons placed`);
  await expect(page.locator(`[data-section=planning] [data-planning-fortnight="${EMPTY}"]`)).toContainText("0 lessons placed");
  // the tools that change a plan are links to the pages that already do it; this page changes nothing
  for (const [name, href] of [["Draft from the rules", "/timetable/draft"], ["Moves by hand", "/timetable/moves"], ["Timetable rules", "/timetable/rules"]])
    await expect(page.locator("[data-section=planning]").getByRole("link", { name })).toHaveAttribute("href", href);
  await expect(page.getByRole("button", { name: /go live/i })).toHaveCount(0);
  // Move lessons opens the existing Moves by hand on this fortnight and class (the engine asks a reason past planning)
  await expect(page.locator("[data-move-lessons]").first()).toHaveAttribute("href", `/timetable/moves?fn=${PLANNED}&class=${f.klass}`);
  // and every lesson in the grid has its own Move, opening Moves by hand with that lesson picked (its day and period)
  await expect(page.locator(`${GRID} [data-move-lesson]`)).toHaveCount(lessons);
  const one = page.locator(`${GRID} [data-move-lesson]`).first();
  expect(await one.getAttribute("href")).toMatch(new RegExp(`^/timetable/moves\\?fn=${PLANNED}&class=${f.klass}&from=\\d{4}-\\d\\d-\\d\\d(~|%7E)[0-9a-f-]{36}$`));
  await one.click();
  await expect(page.getByRole("heading", { name: "Moves by hand", level: 1 })).toBeVisible();
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  await page.context().close();
});

// As live is: the lessons are session rows loaded from the school's sheet, with no timetable_live approval row (CP-27: the timetable
// of a date is its lessons), and the switch is on; so the fortnight educators open on is Live.
test("with the switch on (as live today): the fortnight under way is Live, the later ones are Planning, and each says what educators see", async ({ browser }) => {
  const [{ n: approvals }] = await sql<{ n: number }[]>`select count(*)::int as n from approval where kind = 'timetable_live' and target like ${`${f.klass} %`}`;
  expect(approvals, "the fixture's lessons are loaded rows, never a draft put live").toBe(0);
  await timetableSwitch(sql, true);
  try {
    const page = await as(browser, COORDINATOR.email);
    const res = await page.goto(`/timetable?class=${f.klass}&fn=${PLANNED}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    await expect(page.locator("[data-fortnight-state=planning]")).toContainText("Drafted: planning, educators can already open it");
    await expect(page.locator("[data-section=live] [data-live-fortnight]")).toHaveCount(1);
    await expect(page.locator("[data-section=live] [data-live-fortnight='7401']")).toContainText("live, educators see it"); // the fixture's fortnight runs today
    await expect(page.locator(`[data-section=planning] [data-planning-fortnight="${PLANNED}"]`)).toBeVisible();
    await expect(page.locator(`[data-section=planning] [data-planning-fortnight="${EMPTY}"]`)).toContainText("planning, nothing placed yet");
    await expect(page.locator("[data-section=planning] [data-planning-fortnight='7401']")).toHaveCount(0);
    await page.context().close();
    // an educator reads only, with no Move action
    const edu = await as(browser, EDUCATOR.email);
    await edu.goto(`/timetable?class=${f.klass}&fn=7401`);
    await expect(edu.locator("[data-block=FortnightGrid]")).toBeVisible();
    await expect(edu.locator("[data-move-lessons]")).toHaveCount(0);
    await expect(edu.locator("[data-move-lesson]")).toHaveCount(0);
    await expect(edu.locator("[data-section=planning]")).toHaveCount(0);
    await edu.context().close();
  } finally {
    await timetableSwitch(sql, false);
  }
});

test("the fortnight picker reaches every fortnight of the year, each in its own state", async ({ browser }) => {
  const page = await as(browser, COORDINATOR.email);
  await page.goto(`/timetable?class=${f.klass}&fn=${PLANNED}`);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from fortnight where academic_year_id = ${f.year} and kind = 'teaching'`;
  const picker = page.locator("select[name=fn]");
  await expect(picker.locator("option")).toHaveCount(n);
  await expect(picker).toHaveValue(String(PLANNED));
  await picker.selectOption("7402"); // the fixture's fortnight ahead, in state aligned
  await expect(page).toHaveURL(/fn=7402/);
  await expect(page.locator("[data-fortnight-state=aligned]")).toContainText("Aligned: not live yet");
  await expect(page.locator(`${GRID} a.b-cell`)).toHaveCount(await lessonsIn(7402));
  await page.context().close();
});

test("a fortnight with nothing placed opens too, and says so in words", async ({ browser }) => {
  const page = await as(browser, COORDINATOR.email);
  const res = await page.goto(`/timetable?class=${f.klass}&fn=${EMPTY}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  await expect(page.locator("[data-fortnight-state=planning]")).toContainText("Drafted: not live yet");
  await expect(page.getByText(`Nothing is placed for this class`).first()).toBeVisible();
  await expect(page.locator(`${GRID} a.b-cell`)).toHaveCount(0);
  await expect(page.locator("select[name=fn]")).toHaveValue(String(EMPTY)); // the picker is still there, to go elsewhere
  await page.context().close();
});

test("an educator with nothing live reads a plain page, never not found, and sees none of the plan", async ({ browser }) => {
  const page = await as(browser, EDUCATOR.email);
  for (const href of ["/timetable", `/timetable?class=${f.klass}&fn=${PLANNED}`, `/timetable?class=${f.klass}&view=day`]) {
    const res = await page.goto(href);
    expect(res?.status(), href).toBe(200);
    await expect(page.locator("[data-not-live]"), href).toHaveText("No timetable is live yet. The coordinator makes one live from Setup, Fortnight.");
    await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
    await expect(page.locator(GRID)).toHaveCount(0);
    await expect(page.locator("[data-section=planning]")).toHaveCount(0);
    await expect(page.locator("select[name=fn]")).toHaveCount(0);
  }
  await expect(page.locator("[data-bar] [data-door=timetable]").first()).toBeVisible(); // the menu stays
  await page.context().close();
});

test("the tabs that led nowhere are gone: no Your day, no This week; the Timetable door opens the Timetable", async ({ page }) => {
  const pages = GROUPS.flatMap((d) => d.pages);
  expect(pages.filter((p) => ["Your day", "This week"].includes(p.label))).toEqual([]);
  expect(pages.filter((p) => p.href === "/educator" || p.href === "/educator/week")).toEqual([]);
  expect(GROUPS.find((d) => d.key === "timetable")?.href).toBe("/timetable");
  // the door's pages fold behind "<door> pages" (one nav row, #690 step B): opened, they hold no Your day and no This week
  await page.goto("/today");
  await expect((await doorPages(page)).getByRole("link", { name: "Your day" })).toHaveCount(0);
  await page.goto("/timetable");
  const row = await doorPages(page);
  await expect(row.getByRole("link", { name: "This week" })).toHaveCount(0);
  await expect(row.getByRole("link", { name: "Timetable", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.locator("[data-bar] [data-door=timetable]").first().click();
  await expect(page).toHaveURL(/\/timetable$/);
});
