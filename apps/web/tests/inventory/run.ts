// One screen, one role, one width: open it at its concrete address as that person and run the generic checks; the list is what is wrong.
import AxeBuilder from "@axe-core/playwright";
import type { Browser } from "@playwright/test";
import { addressOf, signedInAs, type Rows } from "../inventory-fixtures";
import { brandRules } from "./brand";
import { completeness, drive, forRole, keyboard, renders, touch, words, type Ctx } from "./checks";
import type { When } from "./load";
import { FIXTURES } from "../inventory-fixtures";
import type { Inventory, Screen } from "./load";

export type Audit = { inv: Inventory; rows: Rows; allow: readonly string[]; names: readonly string[]; address?: Record<string, string> };

async function auditRows(browser: Browser, s: Screen, role: "educator" | "coordinator", width: number, a: Audit): Promise<string[]> {
  const out: string[] = [];
  const byId = new Map(a.inv.screens.map((x) => [x.id, x]));
  for (const scheme of width >= 1000 ? (["light", "dark"] as const) : (["light"] as const)) {
    const context = await signedInAs(browser, role, { width, height: 900 }, scheme);
    const page = await context.newPage();
    const errors: string[] = [];
    const hosts = new Set<string>();
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => /^https?:/.test(r.url()) && hosts.add(new URL(r.url()).host));
    try {
      const address = addressOf(s.route, a.rows, a.address);
      await page.goto(address, { waitUntil: "networkidle" });
      const c: Ctx = { inv: a.inv, role, width, allow: a.allow, names: a.names, address };
      out.push(...(await brandRules(page, scheme, width, `${s.id} (${role}, ${scheme}, ${width})`)));
      if (scheme === "dark") continue;
      out.push(...(await renders(page, s, c, errors)));
      if (s.frame === "bare") continue;
      if (width >= 1000 || s.phone_gate) {
        out.push(...(await completeness(page, s, c)));
        out.push(...(await keyboard(page, s)));
        // the controls that exist only in a state: a child chosen, a filter on, a second page
        for (const state of [...new Set(s.elements.filter((x) => forRole(x, role) && x.when).map((x) => x.when as When))]) {
          await page.goto(address, { waitUntil: "networkidle" });
          out.push(...(await completeness(page, s, c, state)));
        }
        await page.goto(address, { waitUntil: "networkidle" });
      }
      if (width >= 1000) {
        out.push(...(await words(page, s, c, hosts)));
        const axe = await new AxeBuilder({ page }).analyze();
        for (const v of axe.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) out.push(`${s.id}: axe ${v.impact}: ${v.id} (${v.nodes.length} nodes)`);
        for (const e of s.elements.filter((x) => forRole(x, role))) {
          out.push(...(await drive(page, s, e, c, byId)));
          if (page.url() !== `http://localhost:3100${address}`) await page.goto(address, { waitUntil: "networkidle" });
        }
      } else if (s.phone_gate) out.push(...(await touch(page, s)));
    } finally {
      await context.close();
    }
  }
  return out;
}

/** One screen, one role, one width. A screen that says `rest` has its rows made fresh for the run and put away after it, whatever the run did. */
export async function auditScreen(browser: Browser, s: Screen, role: "educator" | "coordinator", width: number, a: Audit): Promise<string[]> {
  if (s.rest) await FIXTURES[s.rest.fixture]?.();
  try {
    return await auditRows(browser, s, role, width, a);
  } finally {
    if (s.rest?.after) await FIXTURES[s.rest.after]?.();
  }
}
