/**
 * U70 (UI-13) — the inventory test, for the school's own pages: Across classes, Staff, Classes, How it works and Setup: each screen of this part of the site that the run covers, as the educator and as the
 * coordinator where each sees it, at 1440 and 400. The inventory, the oracle and the checks are those of tests/u70-inventory.spec.ts; the
 * parts, and why the test is cut into them, are in tests/inventory/parts.ts.
 */
import { expect, test } from "@playwright/test";
import { cases, openInventory, prepare } from "./inventory/define";

const { inv, run, ctx } = openInventory();
test.beforeAll(() => prepare(ctx));
test.afterAll(() => ctx.sql.end());

for (const c of cases("school", inv, run, ctx))
  test(c.title, async ({ browser }) => {
    // a Workspace's panel is a state of its own for every control in it (page charter A2), each reached at its own address before it is
    // driven: the Question bank's eleven panel controls, in light and dark, passed three minutes
    test.setTimeout(300_000);
    const problems = await c.run(browser);
    expect(problems, problems.join("\n")).toEqual([]);
  });
