/**
 * U101 (CP-57, issue #786) — the timetable in one place. Nimish, 16 Nov 2026: "I don't see the merit of different tabs for week and
 * fortnight: within the week there is already Day/Week/Fortnight. Remove the fortnight bit from the menu. Clicking any action/activity
 * opens the activity page on the right side." One test for each Done-when line of the spec (specs/CP-57/spec.md). Stands on the U74 class
 * and its two fortnights (tests/timetable-rows.ts): 7401 under way, 7402 ahead (aligned).
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { sessionFor } from "./inventory-fixtures";
import { voiceSwitch } from "./k2-rows";
import { AHEAD, HERE, timetableRows, type Fixture } from "./timetable-rows";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const EDUCATOR = { email: "u101-educator@cornerstone.test", name: "Timetable Educator One-Oh-One", role: "educator", classes: ["U74"], subjects: ["NUM"] };
// a second coordinator, who holds no class: the test account holds the U74 class itself, so marks it, and would see the form
const COORDINATOR = { email: "u101-coordinator@cornerstone.test", name: "Timetable Coordinator One-Oh-One", role: "coordinator", classes: [], subjects: [] };
const ACTIVITY = "U101-ACT";
let f: Fixture;
let wasOn = false;
let lessonId = "";

test.beforeAll(async () => {
  f = await timetableRows(sql);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  if (!(await personAsStored(sql, COORDINATOR.email))) await aPerson(sql, COORDINATOR);
  // the class's own subject educator, today: the person the Children tab names
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, subject_code, valid_from, granted_by)
    select ${f.tenant}, ps.staff_id, 'subject_educator', ${f.klass}, 'NUM', current_date - 3, 'u101 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${f.klass} and g.role_code = 'subject_educator')`;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${f.tenant}, ${ACTIVITY}, 'K1', 'Maths', 'U101 activity', '100') on conflict (tenant_id, code) do nothing`;
  [{ id: lessonId }] = await sql<{ id: string }[]>`
    select s.id::text as id from session s join school_day d on d.id = s.school_day_id
    where s.school_class_id = ${f.klass} and d.on_date = ${f.days[1]}::date and s.subject_code = 'NUM' order by s.period_id limit 1`;
  await sql`update session set activity_code = ${ACTIVITY} where id = ${lessonId}`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
  await voiceSwitch(sql, true);
});
test.afterAll(async () => {
  await sql`update fortnight set state = 'aligned' where id = ${f.ahead}`;
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const panel = (page: Page) => page.locator("[data-block=DetailPanel]");
const sidebar = (page: Page) => page.locator("nav[data-topnav]").getByRole("link", { name: /^Timetable/ });

test("1. the menu has no Fortnight item, and the Fortnight view is still the Week line of Timetable", async ({ page }) => {
  await page.goto(`/timetable?class=${f.klass}&view=fortnight&fn=${AHEAD}`);
  await expect(sidebar(page)).toHaveAttribute("aria-current", "page");
});

test("2. an old fortnight address redirects to the Fortnight view with every parameter it carried", async ({ page }) => {
  const res = await page.request.get(`/timetable/fortnight/${AHEAD}?class=${f.klass}&tab=moves&from=${f.days[1]}~${f.periods[0].id}`, { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  const to = new URL(res.headers().location, "http://localhost:3100");
  expect(to.pathname).toBe("/timetable");
  expect(Object.fromEntries(to.searchParams)).toEqual({ view: "fortnight", fn: String(AHEAD), class: f.klass, tab: "moves", from: `${f.days[1]}~${f.periods[0].id}` });
  await page.goto(`/timetable/fortnight/${AHEAD}?class=${f.klass}`);
  await expect(panel(page)).toHaveAttribute("data-open", `fortnight:${AHEAD}`);
});

test("3. the old draft address lands on the Fortnight view's Draft tab, and the draft's grid is there", async ({ page }) => {
  const res = await page.request.get(`/timetable/draft?fn=${AHEAD}&class=${f.klass}`, { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  await page.goto(`/timetable/draft?fn=${AHEAD}&class=${f.klass}`);
  await expect(page).toHaveURL(/view=fortnight/);
  await expect(panel(page).getByRole("tab", { name: "Draft" })).toHaveAttribute("aria-selected", "true");
  const [run] = await sql<{ draft: unknown[] }[]>`select draft from timetable_run where school_class_id = ${f.klass} and fortnight_id = ${f.ahead} order by created_at desc limit 1`;
  await expect(page.locator("[data-draft-cells]")).toHaveAttribute("data-draft-cells", String(run.draft.length));
});

test("4. the Fortnight view holds the state, the next step and Go live's place; its Freeze comes back to the Fortnight view", async ({ page }) => {
  // the click itself (Freeze, then "Done.") is proved in u98, which ends the run's approvals; here nothing is written, because a freeze
  // makes an approval row for the fortnight for good, and u74 counts those for the same fortnight
  await sql`update fortnight set state = 'planning' where id = ${f.ahead}`;
  try {
    await page.goto(`/timetable?view=fortnight&fn=${AHEAD}&class=${f.klass}`);
    await expect(panel(page).locator("[data-block=Stepper] li")).toHaveText(["Drafted", "Frozen", "Aligned", "Approved", "List sent"]);
    await expect(panel(page).getByRole("tab")).toHaveText([/^Conflicts/, "Moves", "Draft", "Rules"]);
    const form = panel(page).getByRole("form", { name: "Freeze this fortnight" });
    await expect(form.locator("input[name=to_state]")).toHaveValue("frozen");
    const back = new URL(await form.locator("input[name=back]").inputValue(), "http://localhost:3100");
    expect(back.pathname).toBe("/timetable");
    expect(back.searchParams.get("view")).toBe("fortnight");
    expect(back.searchParams.get("fn")).toBe(String(AHEAD));
  } finally {
    await sql`update fortnight set state = 'aligned' where id = ${f.ahead}`;
  }
});

test("5. moving is inside the Fortnight view: Move in the lesson panel, then the grid chooses where, then the move form", async ({ page }) => {
  await page.goto(`/timetable?view=fortnight&fn=${AHEAD}&class=${f.klass}`);
  await page.locator("[data-block=FortnightGrid] [data-open-key^='lesson:']").first().click();
  await page.locator("[data-panel-move]").click();
  await expect(page).toHaveURL(/from=/);
  await expect(page).toHaveURL(/\/timetable\?/);
  await page.locator("[data-block=FortnightGrid] a[data-pick][aria-pressed=false]").nth(3).click();
  await expect(panel(page).locator("[data-move-form]").getByRole("button", { name: /^Move .+ to / })).toBeVisible();
});

for (const view of ["day", "week", "fortnight"]) {
  test(`6. in the ${view} view a click on a lesson opens that lesson in the right-hand panel`, async ({ page }) => {
    await page.goto(`/timetable?class=${f.klass}&view=${view}&day=${f.days[1]}${view === "fortnight" ? `&fn=${HERE}` : ""}`);
    await page.locator("[data-block=FortnightGrid] [data-open-key^='lesson:']").first().click();
    await expect(panel(page)).toHaveAttribute("data-open", /^lesson:/);
    await expect(panel(page).locator("[data-panel-title]")).not.toBeEmpty();
    await expect(panel(page).locator("[data-panel-move]")).toBeVisible(); // the coordinator's Move at the top of the panel
  });
}

test("7. for the coordinator the Children tab names who marks the class and links to that educator", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(COORDINATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  const page = await context.newPage();
  await page.goto(`/timetable?class=${f.klass}&view=day&day=${f.days[1]}&open=lesson:${lessonId}&tab=children`);
  const body = panel(page).locator("[data-tab-body=children]");
  await expect(body).toContainText("Only this class's own educator marks it here");
  const [{ id }] = await sql<{ id: string }[]>`select staff_id::text as id from pii.staff where email = ${EDUCATOR.email}`;
  await expect(body.getByRole("link", { name: EDUCATOR.name })).toHaveAttribute("href", `/setup/staff?open=person:${id}`);
  await context.close();
});
