/**
 * U74 (UI-6) — the timetable screens: Timetable, Fortnight, Draft from the rules, Moves by hand, Timetable rules. One test for each
 * Done-when line of specs/UI-6/spec.md that a browser can check, as the coordinator (the signed-in test user) and as the
 * educator (read-only). The class "U74" and its two fortnights are the test's own (tests/timetable-rows.ts).
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { locate } from "../lib/menu";
import { sessionFor } from "./inventory-fixtures";
import { GRADE, HERE, AHEAD, YEAR, timetableRows, type Fixture } from "./timetable-rows";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const EDUCATOR = { email: "u74-educator@cornerstone.test", name: "Timetable Educator", role: "educator", classes: ["U74"], subjects: ["NUM"] };
let f: Fixture;
let wasOn = false;

test.beforeAll(async () => {
  f = await timetableRows(sql);
  await sql`delete from timetable_rule where school_class_id = ${f.klass} and kind = 'block' and reason like 'U74 edit %'`; // left by a run that stopped early
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  // the educator holds the class as cover (the roles the timetable reads: educator.timetable_roles)
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${f.tenant}, ps.staff_id, 'cover_educator', ${f.klass}, current_date - 3, 'u74 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${f.klass} and g.role_code = 'cover_educator')`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
});
test.afterAll(async () => {
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const educatorPage = async (browser: import("@playwright/test").Browser): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const TT = () => `/timetable?fn=${HERE}&class=${f.klass}`;
const cellCount = (page: Page) => page.locator("[data-block=FortnightGrid] .b-cell").count();

test("Timetable: its purpose holds, the fortnight is the unit, week A and week B, a moved period marked, a clash red", async ({ page }) => {
  await page.goto(TT());
  await expect(page.getByRole("heading", { name: "Timetable", level: 1 })).toBeVisible();
  await expect(page.getByText(/The fortnight is the unit/)).toBeVisible();
  // the wireframe opens on the week that holds today (five days, named week A or B beside the eyebrow); the Fortnight view is two weeks of five days
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(5);
  await expect(page.getByTestId("stage")).toContainText(/week [AB]/);
  await page.goto(`${TT()}&view=fortnight`);
  const grid = page.locator("[data-block=FortnightGrid]");
  await expect(grid.locator(".b-dh")).toHaveCount(10);
  await expect(grid.locator(".b-moved")).toHaveCount(1);
  expect(await grid.locator(".b-clash").count()).toBeGreaterThan(0);
});

test("Timetable: the grid's cells equal the session rows for the day shown (count and names)", async ({ page }) => {
  await page.goto(`${TT()}&view=day&day=${f.days[1]}`);
  const rows = await sql<{ text: string }[]>`
    select s.text from session s join school_day d on d.id = s.school_day_id where s.school_class_id = ${f.klass} and d.on_date = ${f.days[1]}::date and s.kind <> 'fixed'`;
  expect(await cellCount(page)).toBe(rows.length);
  for (const r of rows) await expect(page.locator("[data-block=FortnightGrid]").getByText(r.text).first()).toBeVisible();
});

test("Timetable: a hand move shows an amber outline and its details name who and why", async ({ page }) => {
  await page.goto(TT());
  await expect(page.locator(".b-moved")).toHaveCount(1);
  const note = page.locator("[data-moved-detail]");
  await expect(note).toContainText("The educator was away");
  await expect(note).toContainText("moved by");
});

test("Timetable: an educator never sees an accept-clash control; a clash cell is red for both roles", async ({ browser, page }) => {
  await page.goto(TT());
  const red = await page.locator(".b-clash").count();
  expect(red).toBeGreaterThan(0);
  const edu = await educatorPage(browser);
  await edu.goto(TT());
  expect(await edu.locator(".b-clash").count()).toBe(red);
  await expect(edu.getByRole("button", { name: /accept/i })).toHaveCount(0);
  await expect(edu.locator("[data-rail]").getByRole("link", { name: /Timetable rules/ })).toHaveCount(0); // the coordinator's rail link
  // the class filter is the coordinator's, and an educator's only when she holds two classes (the old week page's picker)
  const [{ held }] = await sql<{ held: number }[]>`
    select count(distinct g.school_class_id)::int as held from staff_role_grant g join pii.staff ps on ps.staff_id = g.staff_id
    where ps.email = ${EDUCATOR.email} and g.role_code in (select jsonb_array_elements_text(value) from config where key = 'educator.timetable_roles')
      and g.valid_from <= current_date and (g.valid_to is null or g.valid_to >= current_date)`;
  await expect(edu.getByLabel("Class")).toHaveCount(held > 1 ? 1 : 0);
});

const FN = (n: number) => `/timetable/fortnight/${n}`;

test("Fortnight: Approve exists for the coordinator only (a fortnight ready for it), and its request is refused for others", async ({ browser, page }) => {
  await page.goto(FN(AHEAD)); // aligned: the next step is Approve
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(1);
  const edu = await educatorPage(browser);
  await edu.goto(FN(AHEAD));
  await expect(edu.getByRole("button", { name: /Approve|Go live/ })).toHaveCount(0);
  const refused = await edu.request.post("/api/timetable/fortnight", { form: { fortnight_id: f.ahead, to_state: "approved", back: FN(AHEAD) }, maxRedirects: 0 });
  expect(refused.status()).toBe(403);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from approval where kind = 'fortnight' and target = ${f.ahead}`;
  expect(n).toBe(0);
});

test("Fortnight: a frozen fortnight (started) shows no Approve, Go live or edit control", async ({ page }) => {
  await page.goto(FN(HERE));
  await expect(page.locator("[data-frozen]")).toBeVisible();
  await expect(page.getByRole("button", { name: /Approve|Go live/ })).toHaveCount(0);
});

test("Fortnight: the stepper says the fortnight's real state in the school's words", async ({ page }) => {
  await page.goto(FN(AHEAD));
  const steps = page.locator("[data-block=Stepper] li");
  await expect(steps).toHaveText(["Drafted", "Frozen", "Aligned", "Approved", "List sent"]);
  await expect(page.getByText("Aligned").first()).toBeVisible();
});

test("Fortnight: each hand move is listed, with who and why, and the page is the grid (no plan-lines table, no cards)", async ({ page }) => {
  await page.goto(`${FN(HERE)}?class=${f.klass}`);
  await expect(page.locator("[data-hand-move]").first()).toContainText("The educator was away");
  await expect(page.locator("[data-plan-line], [data-card=plan], [data-block=Cards]")).toHaveCount(0);
  await expect(page.locator("[data-block=FortnightGrid] .b-dh")).toHaveCount(10); // the whole fortnight, week A and week B
});

test("Draft from the rules: the draft shown equals the slots the generator wrote (count and cells)", async ({ page }) => {
  await page.goto(`/timetable/draft?fn=${AHEAD}`);
  const [run] = await sql<{ draft: unknown[]; placed: number }[]>`select draft, placed from timetable_run where school_class_id = ${f.klass} and fortnight_id = ${f.ahead} order by created_at desc limit 1`;
  await expect(page.locator("[data-draft-cells]")).toHaveAttribute("data-draft-cells", String(run.draft.length));
  expect(await cellCount(page)).toBe(run.draft.length);
});

test("Draft from the rules: every unmet rule row names a rule row that exists", async ({ page }) => {
  await page.goto(`/timetable/draft?fn=${AHEAD}`);
  const links = page.locator("[data-block=DataTable] tbody a");
  expect(await links.count()).toBeGreaterThan(0);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from timetable_rule where id = ${f.block}`;
  expect(n).toBe(1);
  await expect(page.getByText("U74 sports day (Wednesday)").first()).toBeVisible();
});

test("Draft from the rules: Make a draft never changes a live fortnight's sessions, and an educator cannot make one", async ({ browser }) => {
  const [{ before }] = await sql<{ before: number }[]>`select count(*)::int as before from session where school_class_id = ${f.klass}`;
  const edu = await educatorPage(browser);
  const refused = await edu.request.post("/api/timetable/generate", { form: { year: YEAR, fortnight: String(AHEAD), back: "/timetable/draft" }, maxRedirects: 0 });
  expect(refused.status()).toBe(403);
  await edu.goto(`/timetable/draft?fn=${AHEAD}`);
  await expect(edu.getByRole("button", { name: "Make a draft" })).toHaveCount(0);
  const [{ after }] = await sql<{ after: number }[]>`select count(*)::int as after from session where school_class_id = ${f.klass}`;
  expect(after).toBe(before);
});

test("The web layer answers 403 to an educator for each plan route the engine only checks the staff list on (move, link, generate, accept)", async ({ browser }) => {
  const edu = await educatorPage(browser);
  for (const [route, form] of [
    ["fortnight", { fortnight_id: f.ahead, to_state: "approved" }],
    ["link", { fortnight: String(AHEAD), apply: "1" }],
    ["generate", { year: YEAR, fortnight: String(AHEAD) }],
    ["move", { grade: GRADE, section: "U74", year: YEAR, from_date: f.days[11], from_period: "91", to_date: f.days[12], to_period: "91" }],
    ["clash", { key: "x", reason: "because" }],
  ] as const) {
    const res = await edu.request.post(`/api/timetable/${route}`, { form: { ...form, back: "/timetable" }, maxRedirects: 0 });
    expect(res.status(), route).toBe(403);
  }
});

test("Fortnight, moving: as educator the grid is read-only: no pick, no Accept, no Move, no Undo, and the requests are refused", async ({ browser }) => {
  const edu = await educatorPage(browser);
  await edu.goto(`${FN(HERE)}?class=${f.klass}`);
  await expect(edu.locator("[data-block=FortnightGrid]")).toBeVisible();
  await expect(edu.getByRole("button", { name: /Accept|Move|Undo|Freeze|Align|Approve/ })).toHaveCount(0);
  expect(await edu.locator("[data-pick], [data-move-form]").count()).toBe(0);
});

test("Fortnight, moving: every move is listed with who made it and when, and an undo is a new row", async ({ page }) => {
  await page.goto(`${FN(HERE)}?class=${f.klass}`);
  const row = page.locator("[data-hand-move]").first();
  await expect(row).toContainText("The educator was away");
  await expect(row).toContainText("End-to-end test");
  await expect(page.getByRole("button", { name: "Undo the last move" })).toHaveCount(1);
});

test("Fortnight, moving: choose a lesson, then the lesson to swap it with, say why, and it is moved; Undo moves it back; a clash shows on the grid in the rule's words", async ({ page }) => {
  const url = `${FN(AHEAD)}?class=${f.klass}`;
  await page.goto(url);
  // a clash is red on its block with the rule's own words (the fixture blocks Wednesday: "U74 sports day")
  await expect(page.locator("[data-block=FortnightGrid] .b-clash").first()).toBeVisible();
  await expect(page.locator("[data-clash-note]").first()).toContainText("U74 sports day");
  const picks = page.locator("[data-block=FortnightGrid] a[data-pick]");
  await picks.nth(0).click();
  await expect(page).toHaveURL(/from=/);
  await expect(page.locator("[data-block=FortnightGrid] [data-pick][aria-pressed=true]")).toHaveCount(1);
  expect(await page.locator("[data-move-form]").count()).toBe(0); // one chosen: the form waits for the second
  await page.locator("[data-block=FortnightGrid] a[data-pick][aria-pressed=false]").nth(3).click();
  await expect(page).toHaveURL(/to=/);
  const form = page.locator("[data-move-form]");
  await expect(form).toBeVisible();
  const moves = async () => (await sql<{ n: number }[]>`select count(*)::int as n from change_log where table_name = 'session' and op = 'move' and row_id = ${`${f.klass} ${f.ahead}`}`)[0].n;
  const before = await moves();
  await form.getByLabel("Reason").fill("U74 swaps two lessons");
  await form.getByRole("button", { name: /^Move / }).click();
  await expect(page.locator("[data-block=FortnightGrid]")).toBeVisible();
  expect(await moves()).toBe(before + 1);
  await page.getByRole("button", { name: "Undo the last move" }).click();
  await expect(page.locator("[data-block=FortnightGrid]")).toBeVisible();
  expect(await moves()).toBe(before + 2); // an undo is a new row
});

test("Fortnight, moving: while a lesson is chosen every free slot offers itself as a place to move it to, and none shows before", async ({ page }) => {
  // a lesson period of the class's grade with no lesson on any day: a free slot on each of the fortnight's ten days
  const [p] = await sql<{ id: string }[]>`
    insert into period (tenant_id, grade_code, ord, starts_at, label, fixed) values (${f.tenant}, ${GRADE}, 95, '19:11'::time, 'U74 free', false)
    on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
  try {
    const url = `${FN(AHEAD)}?class=${f.klass}`;
    await page.goto(url);
    await expect(page.locator("[data-block=FortnightGrid]")).toBeVisible();
    await expect(page.locator("[data-slot]")).toHaveCount(0);
    await page.locator("[data-block=FortnightGrid] a[data-pick]").first().click();
    await expect(page.locator("[data-slot]")).toHaveCount(10);
    await page.locator("[data-slot]").nth(4).click();
    await expect(page).toHaveURL(/to=/);
    await expect(page.locator("[data-move-form]")).toBeVisible();
    await expect(page.locator("[data-move-form]").getByRole("button", { name: /^Move .+ to / })).toBeVisible(); // what is moved, from where, and to which day
    await expect(page.locator("[data-move-form] input[name=to_period]")).toHaveValue("95"); // the free slot's own period
  } finally {
    await sql`delete from period where id = ${p.id}`;
  }
});

test("Fortnight, moving: accepting a clash needs a reason ('Say why' otherwise), then the clash is accepted with who and why", async ({ page }) => {
  // an accepted clash stays accepted only until a later move touches its place: a rerun reopens what an earlier run accepted
  const accepted = await sql<{ places: { class: string; date: string; period: string }[] }[]>`select places from timetable_clash where fortnight_id = ${f.ahead} and accepted`;
  for (const c of accepted)
    for (const p of c.places)
      await sql`
        insert into change_log (tenant_id, table_name, row_id, op, before, after, staff_id, origin, reason)
        values (${f.tenant}, 'session', ${`${p.class} ${f.ahead}`}, 'move', ${sql.json({ school_class_id: p.class, on_date: p.date, period_id: p.period })},
          ${sql.json({ school_class_id: p.class, on_date: p.date, period_id: p.period })}, ${f.staff}, ${`staff:${f.staff}`}, 'u74 reopens a clash an earlier run accepted')`;
  await page.goto(`${FN(AHEAD)}?class=${f.klass}`);
  const clash = page.locator("[data-clash]").first();
  await clash.getByRole("button", { name: "Accept the clash" }).click();
  await expect(page.locator(".tt-error")).toContainText("Say why");
  const [{ before }] = await sql<{ before: number }[]>`select count(*)::int as before from approval where kind = 'timetable_clash'`;
  const key = await page.locator("[data-clash]").first().getAttribute("data-clash");
  await page.locator("[data-clash]").first().getByLabel("Reason").fill("Sports day is on purpose");
  await page.locator("[data-clash]").first().getByRole("button", { name: "Accept the clash" }).click();
  const [{ after }] = await sql<{ after: number }[]>`select count(*)::int as after from approval where kind = 'timetable_clash'`;
  expect(after).toBe(before + 1);
  const [a] = await sql<{ reason: string }[]>`select reason from approval where kind = 'timetable_clash' and target = ${key}`;
  expect(a.reason).toBe("Sports day is on purpose");
});

test("Timetable rules: the page sits under Timetable in the menu, not Setup", async ({ page }) => {
  expect(locate("/timetable/rules")?.door.key).toBe("timetable");
  expect(locate("/timetable/rules")?.page.label).toBe("Timetable rules");
  await page.goto(`/timetable/rules?class=${f.klass}`);
  await expect(page.getByRole("heading", { name: "Timetable rules", level: 1 })).toBeVisible();
  await expect(page.locator("header, nav").getByText("Timetable rules").first()).toBeVisible();
});

test("Timetable rules: every edit shows who and when, and the history fold lists it", async ({ page }) => {
  const reason = `U74 edit ${Date.now()}`;
  await page.goto(`/timetable/rules?class=${f.klass}`);
  const block = page.locator("form").filter({ has: page.getByRole("button", { name: "Block", exact: true }) });
  await block.getByLabel("Date").fill(f.days[12]);
  await block.getByLabel("Reason").fill(reason);
  await block.getByRole("button", { name: "Block", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  const fold = page.locator("details#history");
  await expect(fold).toHaveAttribute("open", "");
  const line = fold.locator("[data-edit]").filter({ hasText: reason });
  await expect(line).toHaveCount(1);
  await expect(line).toContainText(/^.*(You|End-to-end test) added/); // who (the engine says "You" to the person who did it)
  await expect(line.locator(".tt-note")).toContainText(/\d/); // when
  await sql`delete from timetable_rule where school_class_id = ${f.klass} and kind = 'block' and reason = ${reason}`;
});
