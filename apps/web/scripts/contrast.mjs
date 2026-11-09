// Every pair tokens.json's usage notes name, measured by the WCAG 2 contrast formula in both themes, and the four colours
// that sit near each other measured apart by CIE76 ΔE in light (UI-14, line 3). Writes docs/design-tokens-contrast.md.
//   node apps/web/scripts/contrast.mjs           write the table; exit 1 if any pair is short
//   node apps/web/scripts/contrast.mjs --check   write nothing; exit 1 if the committed table differs or a pair is short
// A pair that fails is fixed in docs/frontend/tokens.json, never exempted here.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TABLE = path.resolve(web, "../../docs/design-tokens-contrast.md");
const TEXT = 4.5;
const EDGE = 3; // borders, icons, outlines (WCAG 1.4.11)
const APART = 20;

const STATES = ["ok", "wait", "late", "quiet"];
const KINDS = ["period", "child", "activity", "objective", "skill", "assessment", "note"];

/** [foreground, background, least ratio, why]: each from a usage note in tokens.json. */
export const PAIRS = [
  ...["ground", "surface", "panel", "highlight"].map((bg) => ["ink", bg, TEXT, "all text"]),
  ...["ground", "surface", "panel"].map((bg) => ["ink-muted", bg, TEXT, "purpose lines, captions, column heads"]),
  ["link", "ground", TEXT, "links"],
  ["link", "surface", TEXT, "links in a rail box"],
  ["link", "panel", TEXT, "links on a card"],
  ["action-ink", "action", TEXT, "the main action's text on its button"],
  ["action", "ground", EDGE, "the main action's fill and the 'now' outline"],
  ["line-control", "ground", EDGE, "the edge of an input or select"],
  ["line-control", "panel", EDGE, "the edge of an input on a card"],
  ["focus", "ground", EDGE, "the focus ring"],
  ["focus", "panel", EDGE, "the focus ring on a card"],
  ["brand-clay", "ground", EDGE, "the mark and the active door's underline"],
  ...STATES.flatMap((s) => [
    [`state-${s}`, `state-${s}-bg`, TEXT, `a ${s} state's text on its fill`],
    [`state-${s}`, "ground", TEXT, `a ${s} state's text on the page`],
    [`state-${s}`, "panel", TEXT, `a ${s} state's text and ring on a card`],
  ]),
  ["state-wait", "ground", EDGE, "the amber outline on the page"],
  ...KINDS.flatMap((k) => [
    [`kind-${k}`, `kind-${k}-bg`, EDGE, `a ${k}'s icon in its tile`],
    [`kind-${k}`, "ground", EDGE, `a ${k}'s icon on the page`],
    ["ink", `kind-${k}-bg`, TEXT, `text on a ${k}'s tinted header`],
  ]),
  ...["numeracy", "language"].flatMap((s) => [
    [`subject-${s}`, `subject-${s}-bg`, TEXT, `the ${s} word and icon on its fill`],
    [`subject-${s}`, "ground", EDGE, `the ${s} top edge`],
  ]),
  ["subject-arts", "ground", EDGE, "the Arts top edge"],
  ["subject-arts", "subject-arts-bg", EDGE, "the Arts top edge on its own fill"],
  ["subject-arts-ink", "subject-arts-bg", TEXT, "the Arts word and icon on its fill"],
  ["subject-fixed", "subject-fixed-bg", TEXT, "the fixed parts of the day"],
  ...["numeracy", "language", "arts", "fixed"].map((s) => ["ink", `subject-${s}-bg`, TEXT, `text in a ${s} cell`]),
];
export const NEAR = ["subject-language", "subject-arts", "state-wait", "state-late"];

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lum = (h) => {
  const [r, g, b] = rgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const lab = (h) => {
  const [r, g, b] = rgb(h).map((c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92));
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [x, y, z] = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883].map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
export const deltaE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));

/** The table's Markdown and the count of short pairs. */
export function measure(tokens) {
  const byName = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]));
  const at = (name, theme) => {
    const v = byName[name];
    if (v === undefined) throw new Error(`tokens.json has no colour ${name}`);
    return typeof v === "string" ? v : v[theme];
  };
  let short = 0;
  const rows = [];
  for (const [fg, bg, least, why] of PAIRS) {
    const [l, d] = ["light", "dark"].map((th) => contrast(at(fg, th), at(bg, th)));
    const ok = l >= least && d >= least;
    if (!ok) short++;
    rows.push(`| ${fg} | ${bg} | ${why} | ${least}:1 | ${l.toFixed(2)} | ${d.toFixed(2)} | ${ok ? "pass" : "FAIL"} |`);
  }
  const apart = [];
  for (let i = 0; i < NEAR.length; i++)
    for (let j = i + 1; j < NEAR.length; j++) {
      const e = deltaE(at(NEAR[i], "light"), at(NEAR[j], "light"));
      if (e < APART) short++;
      apart.push(`| ${NEAR[i]} | ${NEAR[j]} | ${e.toFixed(1)} | ${e >= APART ? "pass" : "FAIL"} |`);
    }
  const md = [
    "# Design tokens: contrast and distance",
    "",
    "Generated by `node apps/web/scripts/contrast.mjs` from `apps/web/design-system/tokens.json`; do not edit. Each pair is",
    "one a usage note in tokens.json names. Text needs 4.5:1 and a border, icon or outline 3:1 (WCAG 2), in both themes.",
    "A pair that fails is fixed in `docs/frontend/tokens.json`, never exempted.",
    "",
    "| Foreground | Background | Where | Least | Light | Dark | Result |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    `The four colours that sit near each other are at least ${APART} apart (CIE76 ΔE, light theme):`,
    "",
    "| Colour | Colour | ΔE | Result |",
    "|---|---|---|---|",
    ...apart,
    "",
  ].join("\n");
  return { md, short };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { md, short } = measure(JSON.parse(readFileSync(path.join(web, "design-system/tokens.json"), "utf8")));
  let bad = short;
  if (process.argv.includes("--check")) {
    if (!existsSync(TABLE) || readFileSync(TABLE, "utf8") !== md) {
      console.error("stale: docs/design-tokens-contrast.md (run node apps/web/scripts/contrast.mjs)");
      bad++;
    }
  } else writeFileSync(TABLE, md);
  if (short) console.error(`${short} pair(s) short: see docs/design-tokens-contrast.md`);
  process.exit(bad ? 1 : 0);
}
