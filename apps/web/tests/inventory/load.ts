// Reads the inventory (docs/frontend/screens.json, or the file named by INVENTORY=) and says which screens a run covers:
// every screen of a slice in `merged_slices` (a full run), or the slice named by SLICE=UI-n / the screen named by SCREEN=<id>
// (a pull request run). Every other screen is a test.fixme, so the count still to build is always in the report.
import { readFileSync } from "node:fs";
import path from "node:path";

/** `pending`: the control waits on a backend piece that is not on main (the words name it); it is not drawn and not required until the field is removed. `data`: the controls that carry this attribute (a graph node, a table row's link) are this element, however many there are. `when`: the control is not on the page at rest. `peek`: after a child is chosen; `filtered`: once a filter is on (the chips and Clear);
 *  `paged`: only when the rows pass one page. The checker brings the page into that state before it asks for the control. */
export type When = "peek" | "filtered" | "paged";
export type Element = { t: string; label: string; to?: string; href?: string; text?: string; external?: string; for?: "educator" | "coordinator"; note?: string; effect?: string; when?: When; data?: string; pending?: string; roles?: ("educator" | "coordinator")[] };
export type Screen = {
  id: string;
  route: string;
  group: string;
  who: "educator" | "coordinator" | "both";
  title: string;
  elements: Element[];
  rail?: unknown[];
  phone_gate?: boolean;
  frame?: string;
};
export type Inventory = { merged_slices: string[]; slices: { id: string; screens: string[] }[]; bar: Element[]; screens: Screen[] };

const REPO = path.resolve(__dirname, "../../../..");

export function loadInventory(file = process.env.INVENTORY): Inventory {
  const at = file ? path.resolve(file) : path.join(REPO, "docs/frontend/screens.json");
  return JSON.parse(readFileSync(at, "utf8")) as Inventory;
}

/** The ids of the screens this run covers. */
export function covered(inv: Inventory, env: Record<string, string | undefined> = process.env): Set<string> {
  if (env.SCREEN) return new Set(env.SCREEN.split(","));
  if (env.SLICE) return new Set(inv.slices.filter((s) => env.SLICE!.split(",").includes(s.id)).flatMap((s) => s.screens));
  return new Set(inv.slices.filter((s) => inv.merged_slices.includes(s.id)).flatMap((s) => s.screens));
}

/** A title is a pattern when it holds a [param] or a "…" placeholder; otherwise it must equal the h1. */
export const titleMatches = (title: string, h1: string) => {
  if (!/[\[…{]/.test(title)) return title.trim() === h1.trim();
  const re = title.replace(/[.*+?^$()|\\]/g, "\\$&").replace(/\[[^\]]*\]|\{[^}]*\}|…/g, ".+");
  return new RegExp(`^${re}$`).test(h1.trim());
};

/** The screens whose controls may be drawn in this run: those of a slice in `merged_slices` and those the run covers. A control whose
 *  target is none of them is not required (it is not drawn, so it is not a dead link) and is not driven; one that is drawn anyway by
 *  its label is accepted as the element's own, never counted as extra. */
export const builtScreens = (inv: Inventory, env: Record<string, string | undefined> = process.env) =>
  new Set([...inv.slices.filter((s) => inv.merged_slices.includes(s.id)).flatMap((s) => s.screens), ...covered(inv, env)]);
