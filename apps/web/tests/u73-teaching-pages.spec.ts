/**
 * U73 (UI-3c) — the teaching pages: activity, objective, skill. One test per "Done when" line of specs/UI-3c/spec.md that a
 * browser can check now. Rows are the test's own (a class, an educator, an activity, two objectives, skills linked by a
 * confirmed and a proposed link), made once; a second run finds them. Observations are append-only.
 */
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import postgres from "postgres";
import { FAKE_CHILDREN } from "./fake-names";
import { sessionFor } from "./inventory-fixtures";
import { linkFixture } from "./inventory-teaching";
import { gate } from "./m1-13-rows";
import { aClass, aPerson, personAsStored } from "./rows";

const A = "U73A";
const B = "U73B";
const ACT = "ACT-U73-1";
const ACT2 = "ACT-U73-2";
const LO = "LO-U73-1";
const LO_EMPTY = "LO-U73-2";
const EDUCATOR = { email: "u73-educator@cornerstone.test", name: "Ivy Iris", role: "educator", classes: [A], subjects: ["NUM"] };
const NAMES_A = FAKE_CHILDREN.slice(0, 6) as readonly string[];
const NAMES_B = FAKE_CHILDREN.slice(6, 9) as readonly string[];
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });

let tenant = "";
let staff = "";
let classA = "";
let classB = "";
let kids: Record<string, string> = {};
let skills: { code: string; name: string }[] = [];

const part = async (code: string, p: string, source: string) =>
  sql`insert into change_log (tenant_id, table_name, row_id, op, after, origin, reason)
      values (${tenant}, 'activity', ${code}, 'part_source', ${sql.json({ part: p, source, proposal_id: null, staff_id: null, check_me: source === "drafted" })}, 'u73 test', 'u73 fixture')`;

async function observe(name: string, level: number | null, daysAgo: number, outcome = "as_expected") {
  const child = kids[name];
  const at = new Date(Date.now() - daysAgo * 86_400_000);
  const [o] = await sql<{ id: string }[]>`
    insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome, entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by)
    values (${tenant}, gen_random_uuid(), ${ACT}, ${child}, ${classA}, ${outcome}, 'individual', 'form', 2, ${level}, ${at}, ${staff}, ${staff}) returning id`;
  if (level !== null) {
    const mark = level === 3 ? "yes" : level === 2 ? "sometimes" : "not_yet";
    for (const s of skills.slice(0, 2))
      await sql`insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind, mark, seen_by, place, source, observation_id)
        values (${tenant}, ${child}, ${s.code}, 'educator', ${at}, ${staff}, 'observed', ${mark}, ${staff}, 'class', 'u73 test', ${o.id})`;
    await sql`select rebuild_child_observed_state(${child})`;
  }
}

test.beforeAll(async () => {
  // the coordinator may answer a drafted part (curriculum.review_roles); the educator switch stays off
  await gate(sql, "reviewer");
  await sql`update config set value = 'true'::jsonb where key = 'educator.timetable_enabled'`;
  [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  kids = { ...(await aClass(sql, A, "K2", [...NAMES_A])), ...(await aClass(sql, B, "K2", [...NAMES_B])) };
  [classA, classB] = await Promise.all([A, B].map(async (l) => (await sql<{ id: string }[]>`select id from school_class where label = ${l} order by created_at limit 1`)[0].id));
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  [{ id: staff }] = await sql<{ id: string }[]>`select staff_id::text as id from pii.staff where email = ${EDUCATOR.email}`;
  skills = await sql<{ code: string; name: string }[]>`select code, name from registry_skill where tenant_id = ${tenant} order by code limit 4`;
  const [first, second, third] = skills;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no, objective, level_0, level_1, level_2, level_3, steps, steps_list, thinking, materials)
    values (${tenant}, ${ACT}, 'K2', 'Maths', 'Sorting by size', '', 'Sorts things by how big they are.', 'Sorts two things.', 'Sorts three things.', 'Sorts five things.', 'Says why.', 'Lay out; sort.', ${sql.json(["Lay out the things.", "Sort them."])}, 'A child who sorts by colour has not yet seen size.', 'Ten blocks')
    on conflict (tenant_id, code) do nothing`;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no, objective, level_0, level_1, level_2, level_3, steps, thinking, materials)
    values (${tenant}, ${ACT2}, 'K2', 'Maths', 'Counting out loud', '', 'Counts aloud.', 'Counts to three.', 'Counts to five.', 'Counts to ten.', '', '', '', '')
    on conflict (tenant_id, code) do nothing`;
  for (const [code, title] of [[LO, "Sorts by size"], [LO_EMPTY, "Counts aloud to ten"]])
    await sql`insert into learning_objective (tenant_id, code, band, subject, unit, title, signal) values (${tenant}, ${code}, 'K2', 'Numeracy', 'Sorting', ${title}, 'Foundational') on conflict (tenant_id, code) do nothing`;
  await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord) values (${tenant}, ${ACT}, ${LO}, 1) on conflict do nothing`;
  for (const s of [first, second]) {
    await sql`insert into learning_objective_skill (tenant_id, lo_code, skill_code) values (${tenant}, ${LO}, ${s.code}) on conflict do nothing`;
    await sql`insert into activity_skill (tenant_id, activity_code, skill_code) values (${tenant}, ${ACT}, ${s.code}) on conflict do nothing`;
  }
  // second comes after first by a confirmed link; third comes after first by a link nobody has confirmed (the engine's fixture makes both)
  linkFixture(first.code, second.code, third.code);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where class_id = ${classA} and activity_code = ${ACT}`;
  if (n === 0) {
    await observe(NAMES_A[0], 3, 40);
    await observe(NAMES_A[0], 3, 20);
    await observe(NAMES_A[1], 2, 3);
    await observe(NAMES_A[2], 1, 3);
    await observe(NAMES_A[3], 0, 3);
    await observe(NAMES_A[4], null, 3, "absent");
  }
});
test.afterAll(async () => {
  // leave no draft waiting in the curriculum's queue for another spec to count
  for (const code of [ACT, ACT2])
    for (const p of ["objective", "steps", "thinking", "level_0", "level_1", "level_2", "level_3"])
      await sql`insert into change_log (tenant_id, table_name, row_id, op, after, origin, reason) values (${tenant}, 'activity', ${code}, 'part_source', ${sql.json({ part: p, source: null })}, 'u73 test', 'u73 cleanup')`;
  await gate(sql, "closed");
  await sql.end();
});

async function asEducator(browser: Browser, width = 1440): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 900 } });
  await context.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context;
}

// ---- Activity ------------------------------------------------------------------------------------------------------

// CP-48 (Done when 10): what the machine made carries its one symbol, and there is no queue: whoever the curriculum's gate lets in (the
// switch is on here, so the educator too) edits it in place. Keep and Send back are gone with the queue.
test("1 · a part the machine made carries the machine symbol; the educator and the coordinator each edit it in place, and nothing waits to be kept or sent back", async ({ browser, page }) => {
  await sql`update activity set thinking = 'A draft about size.' where code = ${ACT}`;
  await part(ACT, "thinking", "drafted");
  const edu = await asEducator(browser);
  const ep = await edu.newPage();
  await ep.goto(`/setup/activities/${ACT}`);
  await expect(ep.locator('[data-part="thinking"] [data-source="drafted"] [data-machine]')).toHaveCount(1);
  await expect(ep.locator('[data-part="thinking"] [data-answers] summary')).toHaveText(/Edit/);
  await edu.close();
  await page.goto(`/setup/activities/${ACT}`);
  const mine = page.locator('[data-part="thinking"] [data-answers]');
  await expect(mine.getByText("Edit", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Keep|Send back)$/ })).toHaveCount(0);
});

test("2 · an edit writes a change_log row naming who, and the part becomes the person's", async ({ page }) => {
  for (const [p, source] of [["level_1", "drafted"], ["level_2", "drafted"], ["level_3", "drafted"]] as const) {
    await sql`update activity set ${sql(p)} = ${"A draft for " + p} where code = ${ACT}`;
    await part(ACT, p, source);
  }
  const rows = () => sql<{ n: number }[]>`select count(*)::int as n from change_log where table_name = 'activity' and row_id = ${ACT} and staff_id is not null`.then((r) => r[0].n);
  await page.goto(`/setup/activities/${ACT}`);
  for (const [p, words] of [["level_1", "My own words for level one."], ["level_2", "My own words for level two."]] as const) {
    const was = await rows();
    const box = page.locator(`[data-part="${p}"] [data-answers]`);
    await box.getByText("Edit", { exact: true }).click();
    await box.locator("textarea[name=text]").fill(words);
    await box.getByRole("button", { name: "Save" }).click();
    await expect.poll(rows).toBeGreaterThan(was);
    await expect(page.locator(`[data-part="${p}"] [data-source="person"]`)).toBeVisible();
  }
  // the one left as the machine made it keeps its symbol
  await expect(page.locator('[data-part="level_3"] [data-machine]')).toHaveCount(1);
});

test("3 · the parts are listed in reading order, open on load (no fold hides the steps), with the four levels drawn", async ({ page }) => {
  await page.goto(`/setup/activities/${ACT}`);
  await expect(page.getByRole("tab", { name: "Parts" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-part]")).toHaveCount(7);
  await expect(page.locator('[data-part="steps"]')).toBeVisible();
  const levels = page.locator('[data-part^="level_"] > span:first-child');
  await expect(levels).toHaveText(["Level 0", "Level 1", "Level 2", "Level 3"]);
});

// page charter B4: the activity's curriculum page is the coordinator's; recording happens on the lesson, so the page carries no capture
test("20 · the activity page has no photo upload and no capture: a note is recorded on the lesson", async ({ page }) => {
  await page.goto(`/setup/activities/${ACT}`);
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await expect(page.locator("[data-rail-part=capture], main a[href^='/record']")).toHaveCount(0);
});

test("4 · a part with no text is shown empty and marked, never invented", async ({ page }) => {
  await page.goto(`/setup/activities/${ACT2}`);
  await expect(page.locator('[data-part="level_3"]')).toContainText("Empty");
  await expect(page.locator('[data-part="steps"]')).toContainText("Empty");
  await expect(page.locator('[data-part="level_3"] [data-empty]')).toHaveText("Empty: nothing written yet");
});

test("5 · the level bars sum to the children given a level in the last session", async ({ browser }) => {
  const edu = await asEducator(browser);
  const p = await edu.newPage();
  await p.goto(`/setup/activities/${ACT}?tab=taught`);
  const counts = await p.locator("[data-block=LevelBars] .b-lbar .b-num").allInnerTexts();
  const [{ n }] = await sql<{ n: number }[]>`
    select count(distinct child_id)::int as n from activity_observation o where activity_code = ${ACT} and class_id = ${classA} and reached_level is not null
      and (observed_at at time zone 'Asia/Kolkata')::date = (select max((observed_at at time zone 'Asia/Kolkata')::date) from activity_observation where activity_code = ${ACT} and class_id = ${classA})`;
  expect(counts.reduce((t, c) => t + Number(c), 0)).toBe(n);
  expect(n).toBeGreaterThan(0);
  await edu.close();
});

test("6 · the objective the activity builds toward links to the objective", async ({ page }) => {
  await page.goto(`/setup/activities/${ACT}?tab=objectives`);
  await expect(page.locator(`main a[href="/setup/objectives/${LO}"]`).first()).toBeVisible();
});

// ---- Objective -----------------------------------------------------------------------------------------------------

test("7 · no number, percentage or state is shown for the objective itself", async ({ page }) => {
  await page.goto(`/setup/objectives/${LO}`);
  const head = await page.locator("main header").first().innerText();
  const title = await page.locator("h1").innerText();
  expect(title).toBe("Sorts by size");
  expect(head.replace(/learning objective · k2 · numeracy/i, "")).not.toMatch(/\d|%/);
  await expect(page.locator("header [data-block=StatusChip], h1 [data-block=StatusChip]")).toHaveCount(0);
});

test("8 · each skill is a card with a link; a prerequisite shows only when confirmed; activities are rows", async ({ page }) => {
  await page.goto(`/setup/objectives/${LO}`);
  await expect(page.locator("[data-block=Cards] article")).toHaveCount(2);
  const second = page.locator("[data-block=Cards] article", { hasText: skills[1].name }).first();
  await expect(second).toContainText(`Comes after: ${skills[0].name}`);
  await expect(page.locator("main")).not.toContainText(skills[2].name);
  await expect(page.getByRole("link", { name: "Open the skill" })).toHaveCount(2);
  const row = page.locator("table[aria-label^='Activities'] tbody tr", { hasText: "Sorting by size" });
  await expect(row.locator("a")).toHaveAttribute("href", `/setup/activities/${ACT}`);
});

test("9 · an objective with no skill linked says so and invents nothing", async ({ page }) => {
  await page.goto(`/setup/objectives/${LO_EMPTY}`);
  await expect(page.getByText("No skill linked to this objective yet")).toBeVisible();
  await expect(page.locator("[data-block=Cards]")).toHaveCount(0);
});

// ---- Skill ---------------------------------------------------------------------------------------------------------

const skillUrl = (i: number, extra = "") => `/setup/skills/${skills[i].code}${extra}`;

test("10 · a prerequisite or next skill is shown only when its link is confirmed", async ({ browser }) => {
  const edu = await asEducator(browser);
  const p = await edu.newPage();
  await p.goto(skillUrl(1));
  await expect(p.locator("main")).toContainText(skills[0].name);
  await p.goto(skillUrl(0));
  await expect(p.locator(`main a[href="/setup/skills/${skills[1].code}"]`).first()).toBeVisible();
  // the third skill follows the first by a proposed link: it is not offered as a next skill
  await expect(p.locator(`main a[href="/setup/skills/${skills[2].code}"]`)).toHaveCount(0);
  await edu.close();
});

test("11 · the grid's squares are the class's enrolment in Sr. No. order and the stack bar equals them by state", async ({ browser }) => {
  const edu = await asEducator(browser);
  const p = await edu.newPage();
  await p.goto(skillUrl(0));
  const nos = (await p.locator("[data-block=ClassGrid] .b-no").allInnerTexts()).map(Number);
  expect(nos.length).toBe(NAMES_A.length);
  // within each group the squares run in Sr. No. order, and together they are exactly the class
  expect([...nos].sort((a, b) => a - b)).toEqual(NAMES_A.map((_, i) => i + 1));
  const names = await p.locator("[data-block=ClassGrid] .b-nm").allInnerTexts();
  expect(names.map((n) => n.trim()).sort()).toEqual([...NAMES_A].sort());
  const bar = (await p.locator("[data-block=StackBar] .b-sbar").getAttribute("aria-label")) ?? "";
  const byState: Record<string, number> = {};
  for (const m of bar.matchAll(/(\d+) ([a-z ]+)/g)) byState[m[2].trim()] = Number(m[1]);
  const squares = await p.locator("[data-block=ClassGrid] .b-st").allInnerTexts();
  for (const [words, n] of Object.entries(byState)) expect(squares.filter((w) => w.trim().toLowerCase() === words).length).toBe(n);
  await edu.close();
});

test("12 · grouping by state puts a heading and a count over each group and the counts sum to the squares", async ({ browser }) => {
  const edu = await asEducator(browser);
  const p = await edu.newPage();
  await p.goto(skillUrl(0));
  const counts = (await p.locator("section[data-group] [data-count]").allInnerTexts()).map(Number);
  expect(counts.length).toBeGreaterThan(1);
  expect(counts.reduce((t, c) => t + c, 0)).toBe(NAMES_A.length);
  await expect(p.locator("section[data-group] h3").first()).toBeVisible();
  await edu.close();
});

test("13 · tapping a child opens ChildPeek with their history; Escape closes it and focus returns; Open the child lands on their page", async ({ browser }) => {
  // the peek's history route answers only while the school's voice screens are on; the switch goes back as it was found
  const [was] = await sql<{ on: boolean }[]>`select (value)::text = 'true' as on from config where key = 'voice.screens_enabled'`;
  await sql`update config set value = 'true'::jsonb where key = 'voice.screens_enabled'`;
  const edu = await asEducator(browser);
  const p = await edu.newPage();
  await p.goto(skillUrl(0));
  const square = p.locator("[data-block=ClassGrid] [data-peek-open='1']").first();
  await square.click();
  const peek = p.locator("[data-block=ChildPeek]");
  await expect(peek).toBeVisible();
  await expect(peek).toContainText(NAMES_A[0]);
  // the child was seen on several days: the history lists them newest first, each with who and when
  await expect(peek.locator(".b-tli").first()).toBeVisible();
  const dates = await peek.locator(".b-tli .b-caption").allInnerTexts();
  expect(dates.length).toBeGreaterThan(1);
  const ms = dates.map((d) => Date.parse(d.replace(/-/g, " ")));
  expect(ms).toEqual([...ms].sort((a, b) => b - a));
  await expect(peek.locator(".b-tli p").first()).toContainText(/·/);
  await p.keyboard.press("Escape");
  await expect(peek).toHaveCount(0);
  await expect(square).toBeFocused();
  await square.click();
  await peek.getByRole("link", { name: /open the child/i }).click();
  await expect(p).toHaveURL(new RegExp(`/children/${classA}/1$`));
  await edu.close();
  await sql`update config set value = ${was.on ? sql`'true'::jsonb` : sql`'false'::jsonb`} where key = 'voice.screens_enabled'`;
});

test("14 · the spark draws only recorded fortnights: none yet, so its empty words and no line", async ({ browser }) => {
  const edu = await asEducator(browser);
  const p = await edu.newPage();
  await p.goto(skillUrl(0));
  await expect(p.locator("[data-block=Spark][data-empty]")).toContainText("No fortnights recorded yet");
  await expect(p.locator("svg[data-block=Spark] polyline")).toHaveCount(0);
  await edu.close();
});

test("15 · an educator is shown only their own classes; a coordinator picks from every class", async ({ browser, page }) => {
  const edu = await asEducator(browser);
  const p = await edu.newPage();
  await p.goto(skillUrl(0, `?class=${classB}`));
  await expect(p.getByText("Choose a class")).toBeVisible();
  await expect(p.locator("[data-block=ClassGrid]")).toHaveCount(0);
  await edu.close();
  await page.goto(skillUrl(0, `?class=${classB}`));
  await expect(page.locator("[data-block=ClassGrid] .b-nm").first()).toBeVisible();
  const options = await page.locator("select[name=class] option").allInnerTexts();
  expect(options).toEqual(expect.arrayContaining([A, B]));
});

test("19 · a cluster's count equals the chips in it, and the unseen cluster equals the grid's not-seen group", async ({ browser }) => {
  const edu = await asEducator(browser);
  const p = await edu.newPage();
  await p.goto(skillUrl(0));
  const clusters = p.locator("[data-cluster]");
  expect(await clusters.count()).toBeGreaterThan(0);
  for (const c of await clusters.all()) {
    const n = Number(await c.locator("[data-count]").innerText());
    expect(await c.locator("li").count(), await c.innerText()).toBe(n);
  }
  const unseen = Number(await p.locator("[data-cluster=unseen] [data-count]").innerText());
  const group = p.locator("section[data-group=unseen] [data-count]");
  expect(unseen).toBe((await group.count()) ? Number(await group.innerText()) : 0);
  await edu.close();
});

test("16 · while the educator screens are switched off, an educator is shown not found; a coordinator who reviews is not", async ({ browser, page }) => {
  await sql`update config set value = 'false'::jsonb where key = 'educator.timetable_enabled'`;
  try {
    const edu = await asEducator(browser);
    const p = await edu.newPage();
    for (const at of [`/setup/activities/${ACT}`, `/setup/objectives/${LO}`, skillUrl(0)]) {
      await p.goto(at);
      await expect(p.getByText("This page could not be found.")).toBeVisible();
    }
    await edu.close();
    await page.goto(`/setup/activities/${ACT}`);
    await expect(page.locator("h1")).toHaveText("Sorting by size");
  } finally {
    await sql`update config set value = 'true'::jsonb where key = 'educator.timetable_enabled'`;
  }
});
