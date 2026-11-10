// Reads the inventory (docs/frontend/screens.json, or the file named by INVENTORY=) and says which screens a run covers:
// every screen of a slice in `merged_slices` (a full run), or the slice named by SLICE=UI-n / the screen named by SCREEN=<id>
// (a pull request run). Every other screen is a test.fixme, so the count still to build is always in the report.
import { readFileSync } from "node:fs";
import path from "node:path";

export type Element = { t: string; label: string; to?: string; href?: string; text?: string; external?: string; for?: "educator" | "coordinator"; note?: string; effect?: string };
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
