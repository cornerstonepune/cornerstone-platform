/**
 * U86 (CP-49, issue #739) — the lesson page as the page charter's B4 draws it: on the left the class as a grid of child cards (Sr. No. and
 * first name) marked against the activity's rubric, on the right the activity in tabs. One test per Done-when line the page can prove on
 * its own; the save (Done when 1's reload, and 3) waits for the engine's endpoint and is `test.fixme` until it lands. The class is a
 * K2-style class of the spec's own (section U86, grade G9, used by no other spec), its children named from tests/fake-names.ts.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { FAKE_FIRST_NAMES } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { k2Class, voiceSwitch, ROLLS } from "./k2-rows";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const GRADE = "G9";
const ACTIVITY = "U86-ACT-ONE";
const OTHER = "U86-ACT-TWO";
// level 2 is left unwritten: the page says "Not written" there and invents nothing
const LEVELS = ["U86 level zero words", "U86 level one words", "", "U86 level three words"];
const EDUCATOR = { email: "u86-educator@cornerstone.test", name: "Lesson Educator Eighty-Six", role: "educator", classes: [], subjects: [] };
const first = (roll: string) => FAKE_FIRST_NAMES[(Number(roll) - 1) % FAKE_FIRST_NAMES.length];
let klass = "";
let withActivity = "";
let without = "";
let wasTimetable = false;

const as = async (browser: Browser, email: string, width = 1440): Promise<Page> => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 1000 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context.newPage();
};
const grid = (page: Page) => page.locator("[data-child-levels]");

test.beforeAll(async () => {
  const [had] = await sql<{ id: string }[]>`select id from school_class where section = 'U86' and grade_code = ${GRADE} limit 1`;
  if (had) klass = had.id;
  else {
    ({ klass } = await k2Class(sql, "U86"));
    await sql`update school_class set grade_code = ${GRADE} where id = ${klass}`;
  }
  // the class's children carry the repository's fake first names, one per Sr. No.
  for (const roll of ROLLS)
    await sql`update pii.child set first_name = ${first(roll)} where child_id = (select child_id from enrolment where class_id = ${klass} and roll_no = ${roll} and to_date is null limit 1)`;
  const [{ tenant, campus, today }] = await sql<{ tenant: string; campus: string; today: string }[]>`
    select c.tenant_id as tenant, c.campus_id as campus, (now() at time zone 'Asia/Kolkata')::date::text as today from school_class c where c.id = ${klass}`;
  for (const [code, name] of [[ACTIVITY, "U86 first activity"], [OTHER, "U86 second activity"]]) {
    await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, ${code}, ${GRADE}, 'Maths', ${name}, ${code.slice(-3)}) on conflict (tenant_id, code) do nothing`;
    await sql`insert into activity_skill (tenant_id, activity_code, skill_code) select ${tenant}, ${code}, code from registry_skill where tenant_id = ${tenant} order by code limit 2 on conflict do nothing`;
  }
  await sql`
    update activity set objective = 'U86 what it is for', steps = 'U86 first step' || chr(10) || 'U86 second step', materials = 'U86 lay out a bundle',
      level_0 = ${LEVELS[0]}, level_1 = ${LEVELS[1]}, level_2 = ${LEVELS[2]}, level_3 = ${LEVELS[3]}
    where tenant_id = ${tenant} and code = ${ACTIVITY}`;
  const [day] = await sql<{ id: string }[]>`
    insert into school_day (tenant_id, campus_id, on_date, kind) values (${tenant}, ${campus}, ${today}::date, 'teaching')
    on conflict (tenant_id, campus_id, on_date) do update set kind = 'teaching' returning id`;
  const lesson = async (starts: string, ord: number, text: string, activity: string | null) => {
    const [p] = await sql<{ id: string }[]>`
      insert into period (tenant_id, grade_code, ord, starts_at, label, fixed) values (${tenant}, ${GRADE}, ${ord}, ${starts}::time, ${`U86 ${text}`}, false)
      on conflict (tenant_id, grade_code, starts_at) do update set label = excluded.label returning id`;
    const [s] = await sql<{ id: string }[]>`
      insert into session (tenant_id, school_class_id, school_day_id, period_id, subject_code, kind, state, planned, text, activity_code)
      values (${tenant}, ${klass}, ${day.id}, ${p.id}, 'math', 'subject', 'planned', true, ${`U86 ${text}`}, ${activity})
      on conflict (school_class_id, school_day_id, period_id) do update set activity_code = ${activity}, text = excluded.text returning id`;
    return s.id;
  };
  withActivity = await lesson("20:13", 8611, "lesson with an activity", ACTIVITY);
  without = await lesson("20:43", 8612, "lesson without one", null);
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  await sql`
    insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
    select ${tenant}, ps.staff_id, 'cover_educator', ${klass}, current_date - 3, 'u86 test' from pii.staff ps
    where ps.email = ${EDUCATOR.email} and not exists (select 1 from staff_role_grant g where g.staff_id = ps.staff_id and g.school_class_id = ${klass} and g.role_code = 'cover_educator')`;
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasTimetable = r.on;
  await timetableSwitch(sql, true);
  await voiceSwitch(sql, true);
});
test.afterAll(async () => {
  if (without) await sql`update session set activity_code = null where id = ${without}`;
  await timetableSwitch(sql, wasTimetable);
  await voiceSwitch(sql, false);
  await sql.end();
});

test("1. every child enrolled in the class that day is a card: Sr. No. and first name, unmarked until marked", async ({ page }) => {
  await page.goto(`/period/${withActivity}`);
  const cards = grid(page).locator("[data-roll]");
  await expect(cards).toHaveCount(ROLLS.length);
  for (const roll of [ROLLS[0], ROLLS[ROLLS.length - 1]]) {
    const card = grid(page).locator(`[data-roll="${roll}"]`);
    await expect(card).toContainText(`#${roll}`);
    await expect(card).toContainText(first(roll));
    await expect(card).toHaveAttribute("data-state", "unseen"); // grey until marked
  }
});

test("1. the grid is not behind the voice switch: with voice notes off every enrolled child is still a card", async ({ page }) => {
  await voiceSwitch(sql, false);
  try {
    await page.goto(`/period/${withActivity}`);
    await expect(grid(page).locator("[data-roll]")).toHaveCount(ROLLS.length);
    await expect(grid(page).locator(`[data-roll="${ROLLS[0]}"]`)).toContainText(first(ROLLS[0]));
  } finally {
    await voiceSwitch(sql, true);
  }
});

// waits for the CP-49 engine endpoint
test.fixme("1. tapping a card and choosing a level saves it: after a reload the card shows that level's colour and word", async ({ page }) => {
  await page.goto(`/period/${withActivity}`);
  const card = grid(page).locator(`[data-roll="${ROLLS[0]}"]`);
  await card.click();
  await grid(page).locator("[data-choose-level='1']").click();
  await expect(grid(page).locator("[data-saved]")).toBeVisible();
  await page.reload();
  const again = grid(page).locator(`[data-roll="${ROLLS[0]}"]`);
  await expect(again).toHaveAttribute("data-state", "wait"); // level 1 of 4: amber
  await expect(again).toContainText(LEVELS[1]);
});

test("2. the level choices are the activity's own words; a level with none says 'Not written'; Absent and Not willing are choices too", async ({ page }) => {
  await page.goto(`/period/${withActivity}`);
  await grid(page).locator(`[data-roll="${ROLLS[2]}"]`).click();
  const picker = grid(page).locator("[data-level-picker]");
  await expect(picker).toBeVisible();
  const choices = picker.locator("[data-choose-level]");
  await expect(choices).toHaveCount(6);
  for (const n of [0, 1, 3]) await expect(choices.nth(n)).toContainText(LEVELS[n]);
  await expect(choices.nth(2)).toHaveText(/^\s*2\s*Not written\s*$/); // nothing invented beside it
  await expect(choices.nth(4)).toHaveText("Absent");
  await expect(choices.nth(5)).toHaveText("Not willing");
  // the scale's colours: 0 grey, between amber, top green; never red on a child
  await expect(picker.locator("[data-choose-level='0']")).toHaveAttribute("data-state", "quiet");
  await expect(picker.locator("[data-choose-level='2']")).toHaveAttribute("data-state", "wait");
  await expect(picker.locator("[data-choose-level='3']")).toHaveAttribute("data-state", "ok");
  await expect(page.locator("[data-child-levels] [data-state=late]")).toHaveCount(0);
});

// waits for the CP-49 engine endpoint
test.fixme("3. 'Mark the rest at level n' sets every unmarked child to n in one action; a child already marked keeps their level", async ({ page }) => {
  await page.goto(`/period/${withActivity}`);
  await grid(page).locator(`[data-roll="${ROLLS[0]}"]`).click();
  await grid(page).locator("[data-choose-level='3']").click();
  await expect(grid(page).locator("[data-saved]")).toBeVisible();
  await page.getByLabel("Level for the rest").selectOption("2");
  await page.getByRole("button", { name: "Mark the rest at level 2" }).click();
  await expect(grid(page).locator("[data-saved]")).toContainText(`${ROLLS.length - 1} children`);
  await page.reload();
  await expect(grid(page).locator(`[data-roll="${ROLLS[0]}"]`)).toHaveAttribute("data-level", "3");
  await expect(grid(page).locator("[data-roll][data-level='2']")).toHaveCount(ROLLS.length - 1);
  await expect(grid(page).locator("[data-unmarked]")).toContainText("0 not marked");
});

test("7. the right-hand panel: Activity (outcome, numbered steps, lay out, watch for) · Rubric (four coloured rows) · Materials · History", async ({ page }) => {
  await page.goto(`/period/${withActivity}`);
  const panel = page.locator("[data-block=DetailPanel]");
  await expect(panel.getByRole("tab")).toHaveText(["Activity", "Rubric", "Materials", "History"]);
  await expect(panel.locator("[data-part=outcome]")).toContainText("U86 what it is for");
  await expect(panel.getByText("U86 first step")).toBeVisible();
  await expect(panel.getByText("U86 second step")).toBeVisible();
  await expect(panel.getByRole("region", { name: "Lay out" })).toContainText("U86 lay out a bundle");
  await expect(panel.getByRole("region", { name: "Watch for" })).toBeVisible();
  await panel.getByRole("tab", { name: "Rubric" }).click();
  const rows = panel.locator("[data-part=levels] li");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toHaveAttribute("data-state", "quiet");
  await expect(rows.nth(1)).toHaveAttribute("data-state", "wait");
  await expect(rows.nth(2)).toHaveAttribute("data-state", "wait");
  await expect(rows.nth(3)).toHaveAttribute("data-state", "ok");
  await expect(rows.nth(1)).toContainText(LEVELS[1]);
  await expect(rows.nth(2)).toContainText("Not written");
  await panel.getByRole("tab", { name: "Materials" }).click();
  await expect(panel.getByRole("tabpanel")).toContainText("U86 lay out a bundle");
  await panel.getByRole("tab", { name: "History" }).click();
  await expect(panel.getByRole("tabpanel")).toContainText("Last time this class did it");
});

test("8. a lesson with no activity says 'No activity for this lesson yet'; the coordinator is offered Choose an activity, and choosing saves it", async ({ page, browser }) => {
  await page.goto(`/period/${without}`);
  const none = page.locator("[data-no-activity]");
  await expect(none).toContainText("No activity for this lesson yet");
  await expect(page.locator("[data-child-levels]")).toHaveCount(0);
  const choose = none.locator("form[aria-label='Choose an activity']");
  await choose.locator("select").selectOption(OTHER);
  await choose.getByRole("button", { name: "Choose an activity" }).click();
  await expect(page.locator("[data-child-levels]")).toBeVisible();
  const [{ code }] = await sql<{ code: string | null }[]>`select activity_code as code from session where id = ${without}`;
  expect(code).toBe(OTHER);
  await sql`update session set activity_code = null where id = ${without}`;
  // an educator reads the same words and is not offered the choice
  const edu = await as(browser, EDUCATOR.email);
  await edu.goto(`/period/${without}`);
  await expect(edu.locator("[data-no-activity]")).toContainText("No activity for this lesson yet");
  await expect(edu.locator("form[aria-label='Choose an activity']")).toHaveCount(0);
  await edu.context().close();
});

test("11. at 400 px the grid and the panel fit with no sideways scroll", async ({ browser }) => {
  const phone = await as(browser, EDUCATOR.email, 400);
  await phone.goto(`/period/${withActivity}`);
  await expect(grid(phone).locator("[data-roll]")).toHaveCount(ROLLS.length);
  await expect(phone.locator("[data-block=DetailPanel]").getByRole("tab", { name: "Rubric" })).toBeVisible();
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide).toBeLessThanOrEqual(0);
  await phone.context().close();
});

test("11. every control is reachable by keyboard, and no child's name is written to the browser's log", async ({ page }) => {
  const logged: string[] = [];
  page.on("console", (m) => logged.push(m.text()));
  await page.goto(`/period/${withActivity}`);
  await expect(grid(page).locator("[data-roll]")).toHaveCount(ROLLS.length);
  const focused = () => page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    return { roll: e?.dataset.roll ?? null, level: e?.closest("[data-level-picker]") ? "picker" : null, tab: e?.getAttribute("role") === "tab" ? e.textContent : null, rest: e?.hasAttribute("data-rest-button") || e?.getAttribute("name") === "rest-level" };
  });
  // Tab from the top of the page reaches a child's card
  let at = await focused();
  for (let i = 0; i < 80 && !at.roll; i++) {
    await page.keyboard.press("Tab");
    at = await focused();
  }
  expect(at.roll).toBe(ROLLS[0]);
  // Enter opens the choices and takes the focus to them; Escape closes them and gives it back to the card
  await page.keyboard.press("Enter");
  await expect(grid(page).locator("[data-level-picker]")).toBeVisible();
  await expect.poll(async () => (await focused()).level).toBe("picker");
  await page.keyboard.press("Escape");
  await expect(grid(page).locator("[data-level-picker]")).toHaveCount(0);
  await expect.poll(async () => (await focused()).roll).toBe(ROLLS[0]);
  // on through the grid to "Mark the rest", then to the panel's tabs, which the arrow keys move between
  for (let i = 0; i < 200 && !at.rest; i++) {
    await page.keyboard.press("Tab");
    at = await focused();
  }
  expect(at.rest).toBe(true);
  for (let i = 0; i < 200 && !at.tab; i++) {
    await page.keyboard.press("Tab");
    at = await focused();
  }
  expect(at.tab).toBe("Activity");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("[data-block=DetailPanel]").getByRole("tab", { name: "Rubric" })).toHaveAttribute("aria-selected", "true");
  for (const n of FAKE_FIRST_NAMES) expect(logged.join("\n")).not.toContain(n);
});
