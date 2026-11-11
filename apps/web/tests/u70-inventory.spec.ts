/**
 * U70 (UI-13) — the inventory test. docs/frontend/screens.json (or the file named by INVENTORY=) is the oracle: for every screen
 * of a slice in `merged_slices` (a full run), or named by SLICE=UI-n / SCREEN=<id> (a pull request run), it signs in as the
 * educator and as the coordinator, opens the screen at a concrete address from tests/inventory-fixtures.ts, runs the generic
 * checks at 1440 and 400 and drives every control by its kind. The bar is driven once per run. Every other screen is
 * listed as pending in the inventory report (one test that always runs, with each pending screen as an annotation and a
 * count in its title): not run, counted, and never a skipped test, which tests/test_gates.py forbids. Proved on tests/fixtures/mini-inventory.json by
 * u70-inventory-proof.spec.ts.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { FAKE_FIRST_NAMES, FAKE_NAMES } from "./fake-names";
import { inventoryRows, type Rows } from "./inventory-fixtures";
import { voiceSwitch } from "./k2-rows";
import { covered, loadInventory } from "./inventory/load";
import { auditScreen } from "./inventory/run";
import { driveBar } from "./inventory/bar";

const inv = loadInventory();
const run = covered(inv);
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let rows: Rows;
let names: string[] = [];
test.beforeAll(async () => {
  await voiceSwitch(sql, true); // the K2 switch is on for the screens behind it (UI-3 waits_for)
  rows = await inventoryRows(sql);
  names = (await sql<{ first_name: string }[]>`select distinct first_name from pii.child where length(first_name) > 2`).map((r) => r.first_name);
});
test.afterAll(async () => {
  await sql.end();
});

const rolesOf = (who: string, route: string) => {
  // two screens on one address are two versions of it (Today): each is held to its own role, the other version being the other screen
  if ((who === "educator" || who === "coordinator") && inv.screens.filter((x) => x.route === route).length > 1) return [who] as ("educator" | "coordinator")[];
  return (who === "educator" ? ["educator", "coordinator"] : who === "coordinator" ? ["coordinator"] : ["educator", "coordinator"]) as ("educator" | "coordinator")[];
};

const pending = inv.screens.filter((s) => !run.has(s.id));
test(`the inventory report: ${pending.length} of ${inv.screens.length} screens pending, ${inv.screens.length - pending.length} run`, () => {
  for (const s of pending) test.info().annotations.push({ type: "pending", description: `${s.id} (${s.route}): its slice is not in merged_slices` });
  for (const s of inv.screens) for (const e of s.elements) if (e.pending && run.has(s.id)) test.info().annotations.push({ type: "pending", description: `${s.id}: ${e.label} (${e.pending})` });
  console.log(`inventory: ${inv.screens.length - pending.length} screens run, ${pending.length} pending: ${pending.map((s) => s.id).join(", ")}`);
  // every screen belongs to a slice (the inventory's own rule), so a screen is run or pending and never lost
  const inSlice = new Set(inv.slices.flatMap((x) => x.screens));
  expect(inv.screens.filter((x) => !inSlice.has(x.id)).map((x) => x.id)).toEqual([]);
});

for (const s of inv.screens) {
  if (!run.has(s.id)) continue;
  for (const role of rolesOf(s.who, s.route))
    for (const width of [1440, 400])
      test(`${s.id} · ${role} · ${width}`, async ({ browser }) => {
        test.setTimeout(180_000);
        const problems = await auditScreen(browser, s, role, width, { inv, rows, allow: [...FAKE_NAMES, ...FAKE_FIRST_NAMES], names });
        expect(problems, problems.join("\n")).toEqual([]);
      });
}

if (inv.bar.length)
  test("the bar, driven once", async ({ browser }) => {
    test.setTimeout(180_000);
    const problems = await driveBar(browser, inv);
    expect(problems, problems.join("\n")).toEqual([]);
  });
