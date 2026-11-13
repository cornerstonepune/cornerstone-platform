/**
 * U98 — the Fortnight as the page charter's Part C draws it ("Fortnight (plan, freeze, move)": keep; the right panel holds the state stepper,
 * the conflicts, and Draft / Rules as tabs). One test for each thing that line asks, and for the actions it keeps (freeze, move, approve,
 * draft from the rules) working from the panel. Stands on the U74 class and its two fortnights (tests/timetable-rows.ts): 7401 under way
 * (frozen, a hand move), 7402 ahead (aligned, a blocked Wednesday that clashes, a kept draft with a rule not met).
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { sessionFor } from "./inventory-fixtures";
import { AHEAD, HERE, timetableRows, type Fixture } from "./timetable-rows";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const EDUCATOR = { email: "u74-educator@cornerstone.test", name: "Timetable Educator", role: "educator", classes: ["U74"], subjects: ["NUM"] };
let f: Fixture;
let wasOn = false;

test.beforeAll(async () => {
  f = await timetableRows(sql);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${f.tenant}, ps.staff_id, 'cover_educator', ${f.klass}, current_date - 3, 'u74 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${f.klass} and g.role_code = 'cover_educator')`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
});
test.afterAll(async () => {
  await sql`update fortnight set state = 'aligned' where id = ${f.ahead}`; // the fixture's own state, whatever a test did
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const at = (n: number, extra = "") => `/timetable/fortnight/${n}?class=${f.klass}${extra}`;
const panelOf = (page: Page) => page.locator("[data-block=DetailPanel]");
const educator = async (browser: Browser): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const openClashes = async () =>
  (await sql<{ n: number }[]>`select count(*)::int as n from timetable_clash c where c.fortnight_id = ${f.ahead} and not c.accepted
    and exists (select 1 from jsonb_array_elements(c.places) p where p ->> 'class' = ${f.klass})`)[0].n;

test("the right side is the fortnight's own panel, with no rail: its state as a stepper in the engine's words, and the next step at its top", async ({ page, browser }) => {
  await page.goto(at(AHEAD));
  await expect(page.locator("[data-rail]")).toHaveCount(0);
  const panel = panelOf(page);
  await expect(panel).toHaveAttribute("data-open", `fortnight:${AHEAD}`);
  await expect(panel.locator("[data-panel-close]")).toHaveCount(0); // the page's own side: never closed
  const top = panel.locator("[data-panel-state]");
  await expect(top.locator("[data-block=Stepper] li")).toHaveText(["Drafted", "Frozen", "Aligned", "Approved", "List sent"]);
  // aligned: the steps taken are done, the next (Approved) waits
  await expect(top.locator("[data-block=Stepper] li").nth(2)).toHaveAttribute("data-state", "ok");
  await expect(top.locator("[data-block=Stepper] li").nth(3)).toHaveAttribute("data-state", "wait");
  await expect(top.getByRole("button", { name: "Approve" })).toBeVisible();
  // a fortnight under way: frozen, said in the panel, no step button
  await page.goto(at(HERE));
  await expect(panelOf(page).locator("[data-panel-state] [data-frozen]")).toBeVisible();
  await expect(panelOf(page).locator("[data-step-button]")).toHaveCount(0);
  // an educator reads the same steps and takes none
  const edu = await educator(browser);
  await edu.goto(at(AHEAD));
  await expect(panelOf(edu).locator("[data-block=Stepper] li")).toHaveCount(5);
  await expect(panelOf(edu).getByRole("button", { name: /Approve|Freeze|Align|Go live|Accept|Move|Undo|Make a draft/ })).toHaveCount(0);
  await edu.context().close();
});

test("the panel's next step works from there: Freeze moves a drafted fortnight to frozen, the stepper says so, and Align is next", async ({ page }) => {
  // the step the engine takes from the panel's button (Approve is the same form one step later; the database refuses it for this
  // fixture's class, which is not settled, so the step proved here is Freeze)
  await sql`update fortnight set state = 'planning' where id = ${f.ahead}`;
  try {
    await page.goto(at(AHEAD));
    await panelOf(page).getByRole("button", { name: "Freeze" }).click();
    await expect(page.locator("p[role=status]")).toHaveText("Done.");
    const [{ state }] = await sql<{ state: string }[]>`select state from fortnight where id = ${f.ahead}`;
    expect(state).toBe("frozen");
    await expect(panelOf(page).locator("[data-block=Stepper] li").nth(1)).toHaveAttribute("data-state", "ok");
    await expect(panelOf(page).getByRole("button", { name: "Align" })).toBeVisible();
    await expect(panelOf(page).getByRole("button", { name: "Freeze" })).toHaveCount(0);
  } finally {
    await sql`update fortnight set state = 'aligned' where id = ${f.ahead}`;
  }
});

test("the conflicts are the panel's Conflicts tab: one row for each rule in conflict, accepted there with a reason, and the tab comes back", async ({ page }) => {
  await page.goto(at(AHEAD));
  const panel = panelOf(page);
  const n = await openClashes();
  expect(n).toBeGreaterThan(0); // the blocked Wednesday
  await expect(panel.getByRole("tab", { name: `Conflicts (${n})` })).toHaveAttribute("aria-selected", "true"); // open conflicts: the tab it opens on
  await expect(panel.locator("[data-clash]")).toHaveCount(n);
  await expect(panel.locator("[data-clash]").first()).toContainText("U74 sports day");
  // with no reason the engine is never asked: "Say why", and the page comes back on the same tab
  await panel.locator("[data-clash]").first().getByRole("button", { name: "Accept the clash" }).click();
  await expect(page.locator(".tt-error")).toContainText("Say why");
  await expect(page).toHaveURL(/tab=conflicts/);
  await expect(panelOf(page).getByRole("tab", { name: /^Conflicts/ })).toHaveAttribute("aria-selected", "true");
  expect(await openClashes()).toBe(n);
});

test("Draft and Rules are tabs of the panel: Make a draft for this fortnight, each class's last draft and its unmet rules, and the rules the draft reads", async ({ page, browser }) => {
  await page.goto(at(AHEAD, "&tab=draft"));
  const panel = panelOf(page);
  await expect(panel.getByRole("tab", { name: "Draft" })).toHaveAttribute("aria-selected", "true"); // the address carries the tab
  const form = panel.getByRole("form", { name: "Make a draft" });
  await expect(form.getByRole("button", { name: "Make a draft" })).toBeVisible();
  await expect(form).toHaveAttribute("action", "/api/timetable/generate");
  await expect(form.locator("input[name=fortnight]")).toHaveValue(String(AHEAD));
  await expect(form.locator("input[name=back]")).toHaveValue(new RegExp(`tab=draft`));
  // the kept draft of the class, read back as kept, and the rule it could not meet, a link to the rules
  const [run] = await sql<{ placed: number; needed: number }[]>`select placed, needed from timetable_run where school_class_id = ${f.klass} and fortnight_id = ${f.ahead} order by created_at desc limit 1`;
  await expect(panel.locator(`[data-draft="${f.klass}"]`)).toContainText(`${run.placed} of ${run.needed} placed`);
  await expect(panel.locator("[data-unmet]").getByRole("link", { name: "U74 sports day (Wednesday)" })).toHaveAttribute("href", `/timetable/rules?class=${f.klass}`);
  // Rules: what the draft reads, counted from the rule rows
  await panel.getByRole("tab", { name: "Rules" }).click();
  const [{ blocks }] = await sql<{ blocks: number }[]>`select count(*)::int as blocks from timetable_rule where school_class_id = ${f.klass} and kind = 'block'`;
  await expect(panel.locator("dt", { hasText: "Blocked days" }).locator("xpath=following-sibling::dd[1]")).toHaveText(String(blocks));
  await expect(panel.getByRole("link", { name: "Timetable rules" })).toBeVisible();
  // a fortnight under way takes no new draft
  await page.goto(at(HERE, "&tab=draft"));
  await expect(panelOf(page).getByRole("button", { name: "Make a draft" })).toHaveCount(0);
  // the draft is the coordinator's: an educator's panel has Conflicts, Moves and Rules, and no rules link to edit
  const edu = await educator(browser);
  await edu.goto(at(AHEAD));
  await expect(panelOf(edu).getByRole("tab")).toHaveText([/^Conflicts/, "Moves", "Rules"]);
  await panelOf(edu).getByRole("tab", { name: "Rules" }).click();
  await expect(panelOf(edu).locator("dt", { hasText: "Blocked days" })).toBeVisible();
  await expect(panelOf(edu).getByRole("link", { name: "Timetable rules" })).toHaveCount(0);
  await edu.context().close();
});

test("moving: a lesson is chosen on the grid, and the panel opens on Moves with the move, Cancel, the moves made and Undo", async ({ page }) => {
  await page.goto(at(AHEAD));
  const picks = page.locator("[data-block=FortnightGrid] a[data-pick]");
  await picks.nth(0).click();
  await expect(page).toHaveURL(/from=/);
  const panel = panelOf(page);
  await expect(panel.getByRole("tab", { name: "Moves" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator("[data-move-waiting]")).toContainText("Now choose the lesson, or the free slot");
  await page.locator("[data-block=FortnightGrid] a[data-pick][aria-pressed=false]").nth(3).click();
  await expect(page).toHaveURL(/to=/);
  const form = panelOf(page).locator("[data-move-form]");
  await expect(form.getByRole("button", { name: /^Move .+ to / })).toBeVisible();
  await expect(form.locator("input[name=back]")).toHaveValue(/tab=moves/); // made, it comes back to Moves
  await form.getByRole("link", { name: "Cancel" }).click();
  await expect(page).not.toHaveURL(/from=/);
  await expect(panelOf(page).locator("[data-move-form]")).toHaveCount(0);
  // the fortnight under way: its hand moves listed with who and why, and Undo the last move
  await page.goto(at(HERE, "&tab=moves"));
  await expect(panelOf(page).locator("[data-hand-move]").first()).toContainText("The educator was away");
  await expect(panelOf(page).getByRole("button", { name: "Undo the last move" })).toBeVisible();
});
