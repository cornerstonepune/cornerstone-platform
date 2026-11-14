/**
 * M1-13 — the curriculum screens, now Curriculum (/setup/curriculum, a Workspace: each activity's Filled column by where the words came
 * from, the panel on the right, the offers table) and an activity's own page (/setup/activities/<code>, the panel opened full page).
 * Placeholder rows only (tests/m1-13-rows.ts). The K2 parts answer to the educator gate (D-076): the switch, or the staff preview; every
 * test but the gate's own runs as the staff preview (the switch off).
 *
 * Moved with CP-48 (Done when 10, no queue): the walk through the drafted parts (Check the drafted parts, then Keep, Edit, Send back)
 * is now an edit in place of the parts the machine made, from the panel; the rail's shares of whose words are now the panel's tiles.
 * Not kept, with the old pages: the section cards' red/amber/green bar (no screen draws a section's fill now), the old
 * pages' own menu row and breadcrumb, the offer card's activity code and section (the offers table names the activity).
 */
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import postgres from "postgres";
import { clearOffers, code, curriculumRows, offers, RED, gate, STEPS } from "./m1-13-rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const SHOTS = path.resolve(__dirname, "../../../docs/screens/m1-13");
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
let skills: string[];
let taps = 0;

async function tap(target: Locator) {
  taps++;
  await target.click();
}
async function shoot(page: Page, name: string) {
  for (const [size, at] of [["1280", DESKTOP], ["390", PHONE]] as const) {
    await page.setViewportSize(at);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${size}.png`), fullPage: true });
  }
  await page.setViewportSize(DESKTOP);
}

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  ({ skills } = await curriculumRows(sql));
});
test.afterAll(async () => {
  await gate(sql, "closed");
  await clearOffers(sql);
  await sql`delete from activity_skill where activity_code like 'ACT-K2-M113-%'`;
  await sql`delete from activity where code like 'ACT-K2-M113-%'`;
  await sql.end();
});
test.beforeEach(async ({ page }) => {
  await gate(sql, "reviewer");
  await page.setViewportSize(DESKTOP);
});

const ADDRESSES = ["/setup/curriculum", `/setup/activities/${code(2)}`];
const LIST = 'table[aria-label="Activities and skills"]';
const filledOf = (page: Page, c: string) => page.locator(`${LIST} tr[data-row="${c}"] td[data-label="Filled"]`);

test("closed to staff with no preview role while the switch is off: an activity is not found, and Curriculum lists none of them", async ({ page }) => {
  await gate(sql, "closed");
  await page.goto(`/setup/activities/${code(2)}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await page.goto("/setup/curriculum?q=M113");
  await expect(page.locator(`${LIST} tr[data-row^="ACT-K2-M113-"]`)).toHaveCount(0);
  await expect(page.locator("[data-offer], [data-activity-row]")).toHaveCount(0);
});

test("open to head with the switch off (to look, or to review), and to staff once it is on", async ({ page }) => {
  for (const mode of ["look", "reviewer", "open"] as const) {
    await gate(sql, mode);
    for (const url of ADDRESSES) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 }), `${mode} ${url}`).toBeVisible();
      await expect(page.getByText("This page could not be found.")).toHaveCount(0);
    }
  }
});

test("a section lists ten rows a page, is searchable, and a row opens its activity on the right, then full page", async ({ page }) => {
  await page.goto(`/setup/curriculum?topic=${encodeURIComponent(RED)}`);
  await expect(page.locator(`${LIST} [data-row]`)).toHaveCount(10);
  await page.getByRole("navigation", { name: "Activities and skills pages" }).getByRole("link", { name: /Later/ }).click();
  await expect(page.locator(`${LIST} [data-row]`)).toHaveCount(3);
  await page.goto(`/setup/curriculum?topic=${encodeURIComponent(RED)}&q=activity 13`);
  await expect(page.locator(`${LIST} [data-row]`)).toHaveCount(1);
  await page.goto(`/setup/curriculum?q=${code(2)}`);
  await page.locator(`${LIST} [data-row="${code(2)}"] a`).first().click();
  await expect(page).toHaveURL(new RegExp(`open=activity(%3A|:)${code(2)}`));
  await page.locator("[data-block=DetailPanel]").getByRole("link", { name: "Open full page" }).click();
  await expect(page).toHaveURL(new RegExp(`/setup/activities/${code(2)}$`));
  await page.goto(`/setup/curriculum?q=zzz-no-such-activity`);
  await expect(page.getByText("Nothing matches those choices.")).toBeVisible();
});

test("Curriculum counts each part by where its words came from, and the four counts add up to every part of every activity", async ({ page }) => {
  const [w] = await sql<{ school: number; drafted: number; person: number; empty: number }[]>`
    with t as (
      select a.tenant_id, a.code, p.part, btrim(p.txt) as txt
      from activity a cross join lateral (values ('objective', a.objective), ('materials', a.materials), ('steps', a.steps), ('thinking', a.thinking),
        ('level_0', a.level_0), ('level_1', a.level_1), ('level_2', a.level_2), ('level_3', a.level_3)) as p(part, txt)
      where a.band = 'K2')
    select count(*) filter (where t.txt <> '' and coalesce(s.source, 'school') = 'school')::int as school,
      count(*) filter (where t.txt <> '' and s.source = 'drafted')::int as drafted,
      count(*) filter (where t.txt <> '' and s.source = 'person')::int as person,
      count(*) filter (where t.txt = '')::int as empty
    from t left join activity_part_source s on s.tenant_id = t.tenant_id and s.activity_code = t.code and s.part = t.part`;
  const [{ n: total }] = await sql<{ n: number }[]>`select count(*)::int as n from activity where band = 'K2'`;
  const parts = w.school + w.drafted + w.person + w.empty;
  expect(parts).toBe(8 * total); // every part of every activity is one of the four
  await page.goto(`/setup/curriculum?topic=${encodeURIComponent(RED)}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Curriculum");
  // with nothing chosen, the panel counts them: from the sheet, made by the machine, a person wrote, not written
  const tiles = page.locator('[data-block=DetailPanel][data-panel=summary] [data-block="StatTile"]');
  for (const [line, n] of [["parts from the sheet", w.school], ["parts made by the machine", w.drafted], ["parts a person wrote", w.person], ["parts not written", w.empty]] as const) {
    await expect(tiles.filter({ hasText: line }).locator(".b-stat-n"), line).toHaveText(n.toLocaleString("en-IN"));
  }
  // activity 2: three parts the machine made (the steps, the thinking, level 1), the rest the sheet's; activity 3: a person's objective
  await expect(filledOf(page, code(2))).toHaveText("5 sheet · 3 machine");
  await expect(filledOf(page, code(3))).toHaveText("1 person · 7 empty");
  await shoot(page, "fill");
});

test("a person edits the machine's parts in place from the panel, no queue: each becomes theirs, the school's words never offer it", async ({ page }) => {
  // the edit needs no educator switch: head holds a review role (curriculum.review_roles), the switch is off
  taps = 0;
  await page.goto(`/setup/curriculum?q=${code(2)}`);
  await tap(page.locator(`[data-open-key="activity:${code(2)}"]`)); // the row opens it on the right
  const panel = page.locator("[data-block=DetailPanel]");
  await expect(panel.locator('[data-part][data-origin="machine"]')).toHaveCount(3);
  await expect(panel.locator("[data-answers]")).toHaveCount(3); // an Edit on each part the machine made, none on the sheet's
  await expect(panel.getByRole("button", { name: /^(Keep|Send back)$/ })).toHaveCount(0);
  await expect(panel.locator(".pp-steps li")).toHaveCount(STEPS.length); // a short list, not a wall
  await shoot(page, "walk-steps");
  const steps = panel.locator("[data-part=steps]");
  await tap(steps.getByText("Edit", { exact: true }));
  await steps.getByLabel("One step a line.").fill("Lay out the cards\nTouch each card once");
  await tap(steps.getByRole("button", { name: "Save" }));
  await expect(page).toHaveURL(new RegExp(`open=activity(%3A|:)${code(2)}`)); // back where the edit was made
  await expect(panel.locator('[data-part][data-origin="machine"]')).toHaveCount(2);
  // the thinking: a keyword highlighted and how to spot it
  await expect(panel.locator(".pp-slip mark")).toHaveText("Counts twice");
  await expect(panel.locator(".pp-slip")).toContainText("points at the same card two times");
  const level = panel.locator("[data-part=level_1]");
  await tap(level.getByText("Edit", { exact: true }));
  await level.getByLabel("The words").fill("Counts some, in their own words");
  await tap(level.getByRole("button", { name: "Save" }));
  await expect(panel.locator('[data-part][data-origin="machine"]')).toHaveCount(1);
  expect(taps).toBe(5);
  const rows = await sql<{ part: string; source: string }[]>`select part, source from activity_part_source where activity_code = ${code(2)} and part in ('steps','thinking','level_1')`;
  expect(Object.fromEntries(rows.map((r) => [r.part, r.source]))).toEqual({ steps: "person", thinking: "drafted", level_1: "person" });
  const [a] = await sql<{ steps: string; level_1: string }[]>`select steps, level_1 from activity where code = ${code(2)}`;
  expect(a.steps).toBe("• Lay out the cards\n• Touch each card once");
  expect(a.level_1).toBe("Counts some, in their own words");
  await shoot(page, "walk-empty");
});

test("the offers table shows the activity, skills, what was linked, the reason; yes links, no closes", async ({ page }) => {
  await offers(sql, skills);
  const names = Object.fromEntries((await sql<{ code: string; name: string }[]>`select code, name from registry_skill where code = any(${skills})`).map((r) => [r.code, r.name]));
  await page.goto("/setup/curriculum?view=offers");
  await expect(page.getByRole("heading", { name: "Offers waiting" })).toBeVisible();
  const cards = page.locator("tr[data-offer]");
  await expect(cards).toHaveCount(2);
  const first = cards.filter({ hasText: "The nearest examples did not carry it." });
  await expect(first).toContainText("Placeholder activity 3");
  await expect(first.locator('td[data-label="Skills offered"]')).toContainText(names[skills[1]]);
  await expect(first.locator('td[data-label="Already linked"]')).toContainText(names[skills[0]]);
  await shoot(page, "offers");
  await first.locator("[data-offer-yes]").click();
  await expect(cards).toHaveCount(1);
  const linked = await sql<{ skill_code: string; source: string }[]>`select skill_code, source from activity_skill where activity_code = ${code(3)} order by skill_code`;
  expect(linked.find((l) => l.skill_code === skills[1])?.source).toBe("person"); // CP-51: the yes is the person's approval
  await cards.first().locator("[data-offer-no]").click();
  await expect(page.locator("[data-offers]")).toHaveCount(0); // no offer waits: the table is gone
  const after = await sql<{ skill_code: string }[]>`select skill_code from activity_skill where activity_code = ${code(3)}`;
  expect(after.map((r) => r.skill_code)).not.toContain(skills[2]);
  await shoot(page, "offers-empty");
  await clearOffers(sql);
});

test("the staff preview looks and changes nothing: the machine's parts and the offers show, with no Edit, Yes or No", async ({ page }) => {
  await curriculumRows(sql); // the edits above made two of the machine's parts a person's: they are written again
  await gate(sql, "look");
  await offers(sql, skills);
  await page.goto(`/setup/activities/${code(2)}`);
  await expect(page.locator(".pp-steps li")).toHaveCount(STEPS.length);
  await expect(page.locator(`[data-part][data-origin="machine"] [data-machine]`)).toHaveCount(3);
  await expect(page.locator("[data-answers]")).toHaveCount(0);
  await page.goto("/setup/curriculum?view=offers");
  await expect(page.locator("tr[data-offer]")).toHaveCount(2);
  await expect(page.locator("[data-offer-yes], [data-offer-no]")).toHaveCount(0);
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from activity_part_source where activity_code = ${code(2)} and source = 'drafted'`;
  expect(n).toBe(3); // nothing was edited
  await clearOffers(sql);
});

test("the pages use the tokens and Lucide only: no colour written in, no other icon set", async () => {
  const root = path.resolve(__dirname, "..");
  const files = [
    ...["app/(app)/setup/curriculum", "app/(app)/setup/activities/[code]"].flatMap((dir) =>
      readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" }).filter((f) => /\.(tsx?|css)$/.test(f)).map((f) => path.join(root, dir, f)),
    ),
    path.join(root, "lib/curriculum-screens.ts"),
    path.join(root, "components/curriculum-panel.tsx"),
    path.join(root, "components/origin.tsx"),
  ];
  expect(files.length).toBeGreaterThan(4);
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    expect(text, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(text, f).not.toMatch(/from "(react-icons|@heroicons|@phosphor)/);
  }
});
