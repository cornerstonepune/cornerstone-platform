// What every inventory spec file shares (tests/u70-inventory.spec.ts and one file for each part, tests/inventory/parts.ts): the inventory, the
// rows the screens need, and the generic checks and drivers run on each screen of a part at 1440 and 400 as each person that sees it.
// The `test(...)` calls themselves are in each spec file, never here: Playwright cuts the run across runners by the file a test is written in,
// so tests written in one shared file would be one block again.
import type { Browser } from "@playwright/test";
import postgres from "postgres";
import { FAKE_FIRST_NAMES, FAKE_NAMES } from "../fake-names";
import { inventoryRows, type Rows } from "../inventory-fixtures";
import { voiceSwitch } from "../k2-rows";
import { covered, loadInventory } from "./load";
import { partOf, type Part } from "./parts";
import { auditScreen } from "./run";

export type Ctx = { sql: ReturnType<typeof postgres>; rows?: Rows; names: string[] };

/** The inventory and what a run covers, and a file's own connection to the database (opened here, closed by `close`). */
export function openInventory() {
  const inv = loadInventory();
  const ctx: Ctx = { sql: postgres(process.env.DATABASE_URL!, { max: 1 }), names: [] };
  return { inv, run: covered(inv), ctx };
}

/** Before a file's tests: the K2 switch on for the screens behind it (UI-3 waits_for), and the rows the screens need. */
export async function prepare(ctx: Ctx) {
  await voiceSwitch(ctx.sql, true);
  ctx.rows = await inventoryRows(ctx.sql);
  ctx.names = (await ctx.sql<{ first_name: string }[]>`select distinct first_name from pii.child where length(first_name) > 2`).map((r) => r.first_name);
}

type Inv = ReturnType<typeof openInventory>["inv"];

const rolesOf = (inv: Inv, who: string, route: string) => {
  // two screens on one address are two versions of it (Today): each is held to its own role, the other version being the other screen
  if ((who === "educator" || who === "coordinator") && inv.screens.filter((x) => x.route === route).length > 1) return [who] as ("educator" | "coordinator")[];
  return (who === "educator" ? ["educator", "coordinator"] : who === "coordinator" ? ["coordinator"] : ["educator", "coordinator"]) as ("educator" | "coordinator")[];
};

/** One case for each screen of the part this run covers, for each person that sees it, at each width: its title, and what to run. */
export function cases(part: Part, inv: Inv, run: Set<string>, ctx: Ctx) {
  return inv.screens
    .filter((s) => run.has(s.id) && partOf(s) === part)
    .flatMap((s) =>
      rolesOf(inv, s.who, s.route).flatMap((role) =>
        [1440, 400].map((width) => ({
          title: `${s.id} · ${role} · ${width}`,
          run: (browser: Browser) => auditScreen(browser, s, role, width, { inv, rows: ctx.rows!, allow: [...FAKE_NAMES, ...FAKE_FIRST_NAMES], names: ctx.names }),
        })),
      ),
    );
}
