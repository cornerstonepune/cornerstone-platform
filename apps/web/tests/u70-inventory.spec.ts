/**
 * U70 (UI-13) — the inventory test. docs/frontend/screens.json (or the file named by INVENTORY=) is the oracle: for every screen
 * of a slice in `merged_slices` (a full run), or named by SLICE=UI-n / SCREEN=<id> (a pull request run), it signs in as the
 * educator and as the coordinator, opens the screen at a concrete address from tests/inventory-fixtures.ts, runs the generic
 * checks at 1440 and 400 and drives every control by its kind. The bar is driven once per run. Every other screen is
 * listed as pending in the inventory report (one test that always runs, with each pending screen as an annotation and a
 * count in its title): not run, counted, and never a skipped test, which tests/test_gates.py forbids. Proved on tests/fixtures/mini-inventory.json by
 * u70-inventory-proof.spec.ts.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { openInventory, prepare } from "./inventory/define";
import { driveBar } from "./inventory/bar";
import { fileOf, partOf, PARTS } from "./inventory/parts";

// The screens themselves are driven by one file for each part of the site (tests/inventory/parts.ts): this file holds the report (which also checks that
// no screen is left without a part), and the bar.
const { inv, run, ctx } = openInventory();
test.beforeAll(() => prepare(ctx));
test.afterAll(() => ctx.sql.end());

const pending = inv.screens.filter((s) => !run.has(s.id));
test(`the inventory report: ${pending.length} of ${inv.screens.length} screens pending, ${inv.screens.length - pending.length} run`, () => {
  for (const s of pending) test.info().annotations.push({ type: "pending", description: `${s.id} (${s.route}): its slice is not in merged_slices` });
  for (const s of inv.screens) for (const e of s.elements) if (e.pending && run.has(s.id)) test.info().annotations.push({ type: "pending", description: `${s.id}: ${e.label} (${e.pending})` });
  console.log(`inventory: ${inv.screens.length - pending.length} screens run, ${pending.length} pending: ${pending.map((s) => s.id).join(", ")}`);
  // every screen belongs to a slice (the inventory's own rule), so a screen is run or pending and never lost
  const inSlice = new Set(inv.slices.flatMap((x) => x.screens));
  expect(inv.screens.filter((x) => !inSlice.has(x.id)).map((x) => x.id)).toEqual([]);
  // and to a part of the site with its spec file: the split of this test must not drop a screen, and a screen with no part, or a part with no
  // file, would be run by nobody
  expect(inv.screens.filter((x) => partOf(x) === null).map((x) => `${x.id} (${x.group})`), "screens in no part").toEqual([]);
  expect(PARTS.filter((p) => !existsSync(path.join(__dirname, fileOf(p)))), "parts with no spec file").toEqual([]);
});

if (inv.bar.length)
  test("the bar, driven once", async ({ browser }) => {
    test.setTimeout(180_000);
    const problems = await driveBar(browser, inv);
    expect(problems, problems.join("\n")).toEqual([]);
  });
