/**
 * M1-09a — an activity's page in the educator's screens (goals/m1-09a-activity-page.yaml, D-076), on M1-12b's page
 * routes, each part drawn by the shared page-part component (#422). The school's own words are the real Insects sheet (ACT-K2-0348), copied to a code of the test's own; the parts
 * the sheet leaves empty carry test placeholders the machine is said to have made (CP-48: its one symbol, edited in place). No child.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { loadFortnight10, shoot, tapsAreBig, timetableSwitch } from "./educator-screens";
import { SECTION, k2Class } from "./k2-rows";

const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const CODE = "ACT-K2-T09A";
const STEPS = ["Placeholder step: show the picture cards.", "Placeholder step: children sort them."];
const THINKING = { idea: "Placeholder idea: an insect has six legs.", slips: [{ keyword: "spider", spot: "Placeholder: a spider is counted as an insect." }] };
// as the engine's k2_format.render writes the text beside a list; the page trusts a list only while the two agree
const text = { steps: STEPS.map((s) => `• ${s}`).join("\n"), thinking: [THINKING.idea, ...THINKING.slips.map((s) => `• ${s.keyword}: ${s.spot}`)].join("\n") };

test.beforeAll(async () => {
  await k2Class(sql);
  loadFortnight10(SECTION);
});

test.beforeEach(async () => {
  await sql`delete from activity where code = ${CODE}`;
  await sql`
    insert into activity (tenant_id, code, band, strand, name, sheet_no, objective, steps, thinking, level_0, level_1, level_2, level_3, materials, steps_list, thinking_doc)
    select tenant_id, ${CODE}, band, strand, name, sheet_no, objective, ${text.steps}, ${text.thinking}, level_0, level_1, level_2, level_3, materials,
           ${sql.json(STEPS)}, ${sql.json(THINKING)}
    from activity where code = 'ACT-K2-0348'`;
  await sql`
    insert into change_log (tenant_id, table_name, row_id, op, after, origin)
    select tenant_id, 'activity', ${CODE}, 'part_source', jsonb_build_object('part', p, 'source', 'drafted', 'check_me', true), 'a test'
    from activity, unnest(array['steps', 'thinking']) p where code = ${CODE}`;
});
test.afterAll(async () => {
  await sql`delete from activity where code = ${CODE}`;
  await timetableSwitch(sql, false);
  await sql.end();
});

test("while the timetable is switched off an activity's page is not found", async ({ page }) => {
  await timetableSwitch(sql, false);
  await page.goto(`/setup/activities/${CODE}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
});

test("the page shows the school's words, the machine's steps as bullets and how to think as an idea with slips, each machine part marked with its symbol", async ({ page }) => {
  await timetableSwitch(sql, true);
  await page.goto(`/setup/activities/${CODE}`);
  await expect(page.getByRole("heading", { level: 1, name: "Insects" })).toBeVisible();
  const objective = page.locator('[data-part="objective"]');
  await expect(objective.locator(".pp-origin")).toHaveText("From the sheet");
  await expect(objective.locator("[data-answers]")).toHaveCount(1); // CP-53: the school's words too are edited in place by a reviewer
  const steps = page.locator('[data-part="steps"]');
  await expect(steps.locator(".pp-origin")).toHaveText("Made by the machine");
  await expect(steps.locator(".pp-origin [data-machine]")).toHaveCount(1);
  await expect(steps.locator(".pp-steps li")).toHaveText(STEPS);
  const how = page.locator('[data-part="thinking"]');
  await expect(how).toContainText(THINKING.idea);
  await expect(how.locator("mark")).toHaveText("spider");
  await expect(page.locator('[data-part^="level_"] > span:first-child')).toHaveText(["Level 0", "Level 1", "Level 2", "Level 3"]);
  // no person is ever named on the page: not the member of staff who kept a part, not a child
  const [{ names }] = await sql<{ names: string[] }[]>`select coalesce(array_agg(name), '{}') as names from pii.staff`;
  const body = await page.locator("main").innerText();
  for (const n of names) expect(body, "a staff name on the page").not.toContain(n);
  await tapsAreBig(page);
  await shoot(page, "4-activity");
});

// CP-48 (Done when 10): no queue, so no Keep and no Send back; a part the machine made is edited in place and becomes a person's
test("Edit puts her words in place of the machine's and the part becomes hers; nothing waits to be kept or sent back", async ({ page }) => {
  await timetableSwitch(sql, true);
  await page.goto(`/setup/activities/${CODE}`);
  await expect(page.getByRole("button", { name: /^(Keep|Send back)$/ })).toHaveCount(0);
  const steps = page.locator('[data-part="steps"]');
  await steps.getByText("Edit", { exact: true }).click();
  await steps.getByLabel("One step a line.").fill("Placeholder step, in her words.");
  await steps.getByRole("button", { name: "Save" }).click();
  await expect(steps.locator(".pp-origin")).toHaveText("A person's words");
  await expect(steps.locator("[data-machine]")).toHaveCount(0); // hers now: no machine symbol (CP-53: still editable)

  const thinking = page.locator('[data-part="thinking"]');
  await thinking.getByText("Edit", { exact: true }).click();
  await thinking.locator('input[name="idea"]').fill("Placeholder idea, in her words.");
  await thinking.getByRole("button", { name: "Save" }).click();
  await expect(thinking).toContainText("Placeholder idea, in her words.");
  await expect(thinking.locator(".pp-origin")).toHaveText("A person's words");
  const rows = await sql<{ part: string; source: string }[]>`select part, source from activity_part_source where activity_code = ${CODE} and part in ('steps', 'thinking')`;
  expect(Object.fromEntries(rows.map((r) => [r.part, r.source]))).toEqual({ steps: "person", thinking: "person" });
});

test("a period whose line names an activity opens its page, and back returns to the day", async ({ page }) => {
  await timetableSwitch(sql, true);
  const [p] = await sql<{ klass: string; day: string; period: string }[]>`
    select s.school_class_id::text as klass, d.on_date::text as day, s.period_id::text as period from session s
    join school_day d on d.id = s.school_day_id join plan_entry pe on pe.id = s.plan_entry_id
    join activity a on a.id = pe.activity_id where a.code = 'ACT-K2-0348' order by d.on_date limit 1`;
  expect(p, "Fortnight 10 names Insects on a period").toBeTruthy();
  await page.goto(`/period/${p.period}?class=${p.klass}&day=${p.day}`); // the period address of the links: it is the lesson if there is one
  await page.locator("[data-open-activity]").click();
  await expect(page.getByRole("heading", { level: 1, name: "Insects" })).toBeVisible();
  await expect(page).toHaveURL(/\/setup\/activities\/ACT-K2-0348/);
  await page.locator('[data-ux="next"]').click();
  await expect(page).toHaveURL(new RegExp(`/timetable\\?view=day&class=${p.klass}&day=${p.day}`)); // the day it came from, on the Timetable (the old Your day page is gone)
});
