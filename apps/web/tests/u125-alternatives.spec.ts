/**
 * U125 — materials that are alternatives, on the screens (specs/CP-85/spec.md, Done when 2 and the screens of 1).
 *
 *  1. An activity that asks for pencils or crayons makes ONE line on the class list, "Pencils or crayons", and no line of the other.
 *  2. The line's panel offers "Swap to crayons"; choosing it makes the line crayons, "or pencils", and a reload (a rebuild) keeps the choice.
 *  3. The activity's page lists its materials with a small "or" before the second alternative.
 *  4. At 1440 px and 400 px no page scrolls sideways and the controls are at least 44 px tall.
 *
 * Items of this run's own (the run in the name), put on the activity that Fortnight 10 plans for Tuesday, and taken away again. Placeholder staff and class.
 * `SHOTS=<folder>` also saves a screenshot of each screen at both widths, for looking at. Not @core: the browser core is at its budget.
 */
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import path from "node:path";
import { loadFortnight10, materialsFor, timetableSwitch } from "./educator-screens";
import { SECTION, k2Class } from "./k2-rows";

test.describe.configure({ mode: "serial" });
const sql = postgres(process.env.DATABASE_URL!, { max: 2 });
const RUN = Date.now().toString(36);
const TUESDAY = "2026-12-01"; // Fortnight 10, week B
const ACTIVITY = "ACT-K2-0133"; // planned on that Tuesday (materialsFor ties "Craft paper" to it)
const PENCILS = { code: `MAT-U125-${RUN}-1`, name: `Pencils ${RUN}` };
const CRAYONS = { code: `MAT-U125-${RUN}-2`, name: `Crayons ${RUN}` };
let klass = "";

test.beforeAll(async () => {
  ({ klass } = await k2Class(sql));
  loadFortnight10(SECTION);
  await materialsFor(sql);
  await timetableSwitch(sql, true);
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  for (const [i, m] of [PENCILS, CRAYONS].entries()) {
    await sql`insert into material_item (tenant_id, code, name, unit) values (${tenant}, ${m.code}, ${m.name}, 'piece') on conflict do nothing`;
    await sql`insert into activity_material (tenant_id, activity_code, material_code, quantity, ord, alt_group) values (${tenant}, ${ACTIVITY}, ${m.code}, ${10 + 2 * i}, ${90 + i}, 7) on conflict do nothing`;
  }
});
test.afterAll(async () => {
  const mine = [PENCILS.code, CRAYONS.code];
  await sql`delete from activity_material where material_code = any(${mine})`;
  await sql`delete from materials_line where material_code = any(${mine})`;
  await sql`delete from material_item where code = any(${mine})`;
  await sql.end();
});

const open = (page: Page) => page.goto(`/timetable/materials?class=${klass}&day=${TUESDAY}&span=fortnight`);
const line = (page: Page, m: { code: string }) => page.locator(`li[data-line][data-material="${m.code}"]`);
const panel = (page: Page) => page.locator("[data-block=DetailPanel][data-panel=open]");
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const bigTaps = (page: Page) =>
  page.locator("#lines a:visible, #lines button:visible, [data-panel=open] button:visible").evaluateAll((els) =>
    els.map((e) => [e.textContent?.trim(), Math.round(e.getBoundingClientRect().height), Math.round(e.getBoundingClientRect().width)] as const).filter(([, h, w]) => h < 44 || w < 44),
  );
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(process.env.SHOTS, `${name}-${page.viewportSize()?.width}.png`), fullPage: (page.viewportSize()?.width ?? 0) >= 700 }); // a phone's bar is fixed: a full page would draw it over the middle
  }
};

for (const width of [1440, 400]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: width < 700 ? 800 : 1000 } });

    test("one line for pencils or crayons, the others named on it, and the educator swaps it and the choice is kept", async ({ page }) => {
      await open(page);
      const first = line(page, PENCILS);
      await expect(first).toHaveCount(1);
      await expect(line(page, CRAYONS)).toHaveCount(0); // no line of crayons of its own
      await expect(first.locator("[data-alternatives]")).toHaveText(`or crayons ${RUN}`);
      expect(await noSidewaysScroll(page)).toBe(true);
      await first.scrollIntoViewIfNeeded();
      await shot(page, "class-list-or");

      await first.locator("[data-open-key]").click();
      const swap = panel(page).locator("[data-swap]").getByRole("button", { name: `Swap to crayons ${RUN}` });
      await expect(swap).toHaveCount(1); // one control for the one alternative
      expect(await bigTaps(page)).toEqual([]);
      await shot(page, "class-list-or-panel");
      await swap.click();

      const now = line(page, CRAYONS);
      await expect(now).toHaveCount(1);
      await expect(now.locator("[data-alternatives]")).toHaveText(`or pencils ${RUN}`);
      await expect(line(page, PENCILS)).toHaveCount(0);
      await page.reload(); // the page builds the list again: her choice stays
      await expect(line(page, CRAYONS)).toHaveCount(1);
      await expect(line(page, PENCILS)).toHaveCount(0);
      await expect(line(page, CRAYONS).locator("[data-alternatives]")).toHaveText(`or pencils ${RUN}`);
      expect(await noSidewaysScroll(page)).toBe(true);

      // and back, so the next width starts from the plan's first alternative (her line is still open on the right)
      await panel(page).locator("[data-swap]").getByRole("button", { name: `Swap to pencils ${RUN}` }).click();
      await expect(line(page, PENCILS)).toHaveCount(1);
      await expect(line(page, PENCILS).locator("[data-alternatives]")).toHaveText(`or crayons ${RUN}`);
    });

    test("the activity's materials mark the second alternative with an or", async ({ page }) => {
      await page.goto(`/setup/activities/${ACTIVITY}`);
      const items = page.locator("[data-materials] li");
      await expect(items.filter({ hasText: PENCILS.name })).toHaveCount(1);
      const second = items.filter({ hasText: CRAYONS.name });
      await expect(second.locator("[data-or]")).toHaveText("or");
      await expect(items.filter({ hasText: PENCILS.name }).locator("[data-or]")).toHaveCount(0); // the first is not marked
      expect(await noSidewaysScroll(page)).toBe(true);
      await shot(page, "activity-materials-or");
    });
  });
}
