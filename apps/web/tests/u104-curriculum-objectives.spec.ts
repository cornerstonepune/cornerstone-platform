/**
 * U104 (CP-64, issue #800) — the curriculum screens: the Objectives table (Grade, Subject, Topic, Objective, capability, words, activities,
 * origin), one objective's whole chain both ways, and Check this week. One test for each Done-when line the screens can prove
 * (specs/CP-64/spec.md; its fifth line, confirming a batch, waits for the engine route and the approval kind). The rows are the spec's own: twelve
 * objectives of a topic of its own (U104T, under Maths), two activities, one capability, one skill; the figures are read back from the rows.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { timetableSwitch } from "./educator-screens";
import { sessionFor } from "./inventory-fixtures";
import { aPerson, personAsStored } from "./rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const TOPIC = "U104T";
const SUBJECT = "NUM";
const CAP = "v2-deep-knowledge";
const code = (n: number) => `LO-U104-${String(n).padStart(2, "0")}`;
let tenant = "";
let skill = "";
let wasOn = false;
const G9 = ["LO-U104-G9-1", "LO-U104-G9-2"]; // a grade band of the spec's own, so confirming its batch touches nothing of the school's
const EDUCATOR = { email: "u104-educator@cornerstone.test", name: "Curriculum Educator", role: "educator", classes: [], subjects: [] };

test.beforeAll(async () => {
  // an objective's page is one of the educator's screens, open only while the timetable is switched on (the engine's `/timetable/open`)
  const [r] = await sql<{ on: boolean }[]>`select coalesce((select value = 'true'::jsonb from config where key = 'educator.timetable_enabled'), false) as on`;
  wasOn = r.on;
  await timetableSwitch(sql, true);
  [{ id: tenant }] = await sql<{ id: string }[]>`select tenant_id as id from subject where code = ${SUBJECT} limit 1`;
  await sql`insert into topic (tenant_id, code, subject_code, name, ord) values (${tenant}, ${TOPIC}, ${SUBJECT}, 'U104 counting bears', 999) on conflict (tenant_id, code) do nothing`;
  for (let n = 1; n <= 12; n++)
    await sql`
      insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code, topic_code)
      values (${tenant}, ${code(n)}, 'G4', 'Numeracy', 'U104 unit', ${`U104 objective ${String(n).padStart(2, "0")}`}, 'Foundational', 'school', ${SUBJECT}, ${TOPIC})
      on conflict (tenant_id, code) do update set topic_code = excluded.topic_code`; // a run before this took the topic away, which left these with none
  for (const [a, name] of [["ACT-U104-A", "U104 first activity"], ["ACT-U104-B", "U104 second activity"]])
    await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, ${a}, 'G4', 'Maths', ${name}, ${a.slice(-1)}) on conflict (tenant_id, code) do nothing`;
  for (const [a, lo, src, ord] of [["ACT-U104-A", 1, "machine", 1], ["ACT-U104-B", 1, "school", 2], ["ACT-U104-A", 2, "school", 1]] as const)
    await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (${tenant}, ${a}, ${code(lo)}, ${ord}, ${src}) on conflict do nothing`;
  await sql`insert into objective_statement (tenant_id, lo_code, framework_code, statement_code, relation, source) values (${tenant}, ${code(1)}, 'CS-PROFILE', ${CAP}, 'counts_toward', 'machine') on conflict do nothing`;
  [{ code: skill }] = await sql<{ code: string }[]>`select code from registry_skill where tenant_id = ${tenant} order by code limit 1`;
  await sql`insert into learning_objective_skill (tenant_id, lo_code, skill_code, source) values (${tenant}, ${code(1)}, ${skill}, 'machine') on conflict do nothing`;
});
test.beforeAll(async () => {
  // a batch of the machine's, made again each run (a confirmed batch is a person's for good)
  for (const lo of G9)
    await sql`
      insert into learning_objective (tenant_id, code, band, subject, unit, title, signal, source, subject_code)
      values (${tenant}, ${lo}, 'G9', 'Arts', 'U104 unit', ${`U104 ${lo}`}, 'Foundational', 'school', 'ART') on conflict (tenant_id, code) do nothing`;
  for (const lo of G9) await sql`insert into activity_objective (tenant_id, activity_code, lo_code, ord, source) values (${tenant}, 'ACT-U104-A', ${lo}, 9, 'machine') on conflict (tenant_id, activity_code, lo_code) do update set source = 'machine'`;
  await sql`insert into learning_objective_skill (tenant_id, lo_code, skill_code, source) values (${tenant}, ${G9[0]}, ${skill}, 'machine') on conflict (tenant_id, lo_code, skill_code) do update set source = 'machine'`;
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
});

test.afterAll(async () => {
  // the spec's topic is under Maths, where u31 counts the six topics by operation: it is taken away with the link to it, so no spec that runs
  // after this one in a runner finds a seventh (the objectives stay, as a confirmed batch is a person's for good)
  await sql`update learning_objective set topic_code = null where tenant_id = ${tenant} and topic_code = ${TOPIC}`;
  await sql`delete from topic where tenant_id = ${tenant} and code = ${TOPIC}`;
  await timetableSwitch(sql, wasOn);
  await sql.end();
});

const rowOf = (page: import("@playwright/test").Page, n: number) => page.locator(`[data-objective="${code(n)}"]`);

const FLOW = `/setup/curriculum?grade=G4&subject=${SUBJECT}&topic=${TOPIC}`;

test("1. the flow gives each objective its capability, its words, its activity count and its machine mark, and opens its activities", async ({ page }) => {
  await page.goto(FLOW);
  const [{ capability }] = await sql<{ capability: string }[]>`select text as capability from framework_statement where framework_code = 'CS-PROFILE' and code = ${CAP}`;
  const words = (await sql<{ w: string }[]>`
    select distinct w from framework_statement g cross join lateral jsonb_array_elements_text(g.items) w
    where g.framework_code = 'CS-PROFILE' and g.kind = 'group' and g.parent_code = ${CAP} order by 1`).map((r) => r.w);
  const one = rowOf(page, 1);
  await expect(one).toContainText("U104 objective 01");
  await expect(one.locator("[data-capability]")).toContainText(capability);
  for (const w of words) await expect(one.locator("[data-words]")).toContainText(w);
  await expect(one.locator("[data-machine]")).toHaveCount(1); // made by the machine
  await expect(rowOf(page, 2).locator("[data-machine]")).toHaveCount(0);
  // choosing an objective lists its activities, the machine's link marked
  await one.locator("[data-objective-row]").click();
  await expect(page).toHaveURL(new RegExp(`objective=${code(1)}`));
  await expect(rowOf(page, 1).locator("[data-activity-row]")).toHaveCount(2);
  await expect(rowOf(page, 1).locator("[data-activity-row=ACT-U104-A]")).toContainText("U104 first activity");
  await expect(rowOf(page, 1).locator("[data-machine]")).toHaveCount(2); // the objective's own mark and the machine's activity link
  await expect(rowOf(page, 2).locator("[data-activity-row]")).toHaveCount(0);
});

test("2. each step is a choice in the address: grade, subject, topic; the appendix lists every objective ten a page with the total", async ({ page }) => {
  await page.goto("/setup/curriculum?grade=G4");
  await expect(page.locator("[data-flow-chip]").filter({ hasText: "U104" })).toHaveCount(0); // a topic shows only once its subject is chosen
  await page.goto(`/setup/curriculum?grade=G4&subject=${SUBJECT}`);
  await page.locator(`[data-flow-chip="${TOPIC}"]`).click();
  await expect(page).toHaveURL(new RegExp(`topic=${TOPIC}`));
  await expect(page.locator("[data-objective]")).toHaveCount(12);
  await page.goto(`/setup/curriculum?grade=G1&subject=${SUBJECT}&topic=${TOPIC}`);
  await expect(page.locator("[data-objective]")).toHaveCount(0);
  await page.goto(`/setup/curriculum?view=appendix&part=objectives&topic=${TOPIC}`);
  await expect(page.locator("[data-total]")).toHaveAttribute("data-total", "12");
  await expect(page.locator("tr[data-objective]")).toHaveCount(10);
  await page.goto(`/setup/curriculum?view=appendix&part=objectives&topic=${TOPIC}&page=2`);
  await expect(page.locator("tr[data-objective]")).toHaveCount(2);
  await page.goto(`/setup/curriculum?view=appendix&part=objectives&topic=${TOPIC}&origin=machine`);
  await expect(page.locator("tr[data-objective]")).toHaveCount(1);
  // the appendix also lists the topics and the activities and skills
  await page.goto("/setup/curriculum?view=appendix&part=topics");
  await expect(page.getByRole("table", { name: "Topics" })).toContainText("U104 counting bears");
  await page.goto("/setup/curriculum?view=appendix");
  await expect(page.getByRole("table", { name: "Activities and skills" })).toBeVisible();
});

test("3. an objective's page shows its whole chain: up to its place, capability and framework statements, down to its skills and activities", async ({ page }) => {
  await page.goto(`/setup/objectives/${code(1)}`);
  const up = page.locator("[data-chain-up]");
  await expect(up.locator("[data-chain-grade]")).toContainText("G4");
  await expect(up.locator("[data-chain-topic]")).toContainText("U104 counting bears");
  await expect(up.locator("[data-chain-capability]")).toContainText("Capability:");
  await expect(up.locator("[data-chain-capability] [data-machine]")).toHaveCount(1);
  const down = page.locator("[data-chain-down]");
  await expect(down.locator("[data-chain-activity]")).toHaveCount(2);
  await expect(down.locator("[data-chain-activity=ACT-U104-A]")).toContainText("U104 first activity");
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from evidence_event where skill_code = ${skill} and confirmed_by is not null`;
  await expect(down.locator(`[data-chain-skill="${skill}"]`)).toContainText(`${n} piece${n === 1 ? "" : "s"} of confirmed evidence`);
  // an objective with nothing under it says so, in words
  await page.goto(`/setup/objectives/${code(5)}`);
  await expect(page.locator("[data-chain-down]")).toContainText("No activity linked yet.");
  await expect(page.locator("[data-chain-no-statements]")).toBeVisible();
});

test("4. Check this week lists the machine-made rows by grade and subject, counted from the tables, and shows no group with none", async ({ page }) => {
  await page.goto("/setup/curriculum/check");
  const [expected] = await sql<{ n: number }[]>`
    select (
      (select count(*) from activity_objective x join learning_objective lo on lo.tenant_id = x.tenant_id and lo.code = x.lo_code where x.source = 'machine' and not lo.retired and lo.band = 'G4' and lo.subject_code = ${SUBJECT})
    + (select count(*) from learning_objective_skill x join learning_objective lo on lo.tenant_id = x.tenant_id and lo.code = x.lo_code where x.source = 'machine' and not lo.retired and lo.band = 'G4' and lo.subject_code = ${SUBJECT})
    + (select count(*) from objective_statement x join learning_objective lo on lo.tenant_id = x.tenant_id and lo.code = x.lo_code where x.source = 'machine' and not lo.retired and lo.band = 'G4' and lo.subject_code = ${SUBJECT}))::int as n`;
  await expect(page.locator(`[data-check="G4~${SUBJECT}"]`)).toHaveAttribute("data-to-check", String(expected.n));
  for (const n of await page.locator("[data-check]").evaluateAll((rs) => rs.map((r) => Number(r.getAttribute("data-to-check"))))) expect(n).toBeGreaterThan(0);
  // a group opens the machine-made objectives behind it
  await page.locator(`[data-check-open="G4~${SUBJECT}"]`).click();
  await expect(page).toHaveURL(new RegExp(`origin=machine`));
  await expect(page.locator("[data-objective]").first()).toBeVisible();
});

test("the old Objectives address leads into the flow, its choices kept", async ({ page }) => {
  await page.goto(`/setup/curriculum/objectives?subject=${SUBJECT}&topic=${TOPIC}`);
  await expect(page).toHaveURL(new RegExp(`/setup/curriculum\\?subject=${SUBJECT}&topic=${TOPIC}`));
  await expect(page.locator("[data-objective]")).toHaveCount(12);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Curriculum");
});

const approvals = async () => (await sql<{ n: number }[]>`select count(*)::int as n from approval where kind = 'curriculum_link' and target like 'G9~ART~%'`)[0].n;
const sources = async () => (await sql<{ s: string }[]>`
  select source as s from activity_objective where lo_code = any(${G9}) union all select source from learning_objective_skill where lo_code = any(${G9})`).map((r) => r.s);

test("5. a coordinator confirms a batch: its rows become a person's, one approval row keeps the yes, and a second confirm changes nothing", async ({ page }) => {
  const before = await approvals();
  expect(await sources()).toEqual(["machine", "machine", "machine"]); // two activity links and one skill link, the machine's
  await page.goto("/setup/curriculum/check");
  await expect(page.locator('[data-check="G9~ART"]')).toHaveAttribute("data-to-check", "3");
  await page.locator('[data-confirm="G9~ART"]').click();
  await expect(page.locator("[data-confirmed]")).toHaveAttribute("data-confirmed", "3");
  expect(await sources()).toEqual(["person", "person", "person"]);
  expect(await approvals()).toBe(before + 1);
  const [row] = await sql<{ by: string; decision: string }[]>`select "by", decision from approval where kind = 'curriculum_link' and target like 'G9~ART~%' order by seq desc limit 1`;
  expect(row).toEqual({ by: "e2e@cornerstone.test", decision: "approved" });
  // the group has nothing left of the machine's, so it is no longer listed, and nothing more is written
  await page.goto("/setup/curriculum/check");
  await expect(page.locator('[data-check="G9~ART"]')).toHaveCount(0);
  expect(await approvals()).toBe(before + 1);
});

test("an educator sees the list but no Confirm: confirming is the coordinators'", async ({ browser }) => {
  const c = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width: 1440, height: 900 } });
  await c.addCookies([{ name: "cs_staff", value: sessionFor(EDUCATOR.email), domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  const page = await c.newPage();
  await page.goto("/setup/curriculum/check");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Check this week");
  await expect(page.locator("[data-confirm]")).toHaveCount(0);
  await c.close();
});
