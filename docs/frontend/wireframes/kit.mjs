#!/usr/bin/env node
// kit.mjs: writes kit.css from docs/frontend/tokens.json (every colour, type, space, radius, shadow and motion value),
// the icon map in apps/web/lib/icons.tsx (plus the kit's added concepts, below), and components.css (the blocks).
// No colour is typed by hand: each value comes from tokens.json, light and dark.
//   node docs/frontend/wireframes/kit.mjs            regenerate kit.css
// Icons are drawn from lucide-react's own files at the site's pinned version. Point LUCIDE_DIR at an unpacked
// lucide-react (default apps/web/node_modules/lucide-react; `npm pack lucide-react@<version>` works too). Without it
// the icon section of the current kit.css is kept and the script says so.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const TOKENS = join(ROOT, "docs/frontend/tokens.json");
const ICONS_TSX = join(ROOT, "apps/web/lib/icons.tsx");
const OUT = join(HERE, "kit.css");

// Concepts the site's lib/icons.tsx does not name yet. The builder adds each to ICONS when its first screen needs it
// (DESIGN.md, "Icons"); until then this is the one place they are mapped.
export const ADDED_ICONS = {
  period: "calendar-clock", assessment: "clipboard-check", photo: "camera", setup: "settings", timetable: "calendar-range",
  children: "users-round", "not-seen": "circle-dashed", numeracy: "hash", language: "messages-square", arts: "palette",
  materials: "package", details: "eye", upload: "upload", help: "circle-help", "sign-out": "log-out", "acting-as": "user-cog",
  open: "chevron-down", trail: "chevron-right", moved: "move-right", clash: "triangle-alert",
};

const kebab = (pascal) => pascal.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([a-zA-Z])([0-9])/g, "$1-$2").toLowerCase();

export function iconMap() {
  const src = readFileSync(ICONS_TSX, "utf8");
  const body = src.slice(src.indexOf("export const ICONS = {"), src.indexOf("} satisfies"));
  const map = {};
  for (const m of body.matchAll(/^\s*"?([a-z-]+)"?:\s*([A-Z]\w+),/gm)) map[m[1]] = kebab(m[2]);
  return { ...map, ...ADDED_ICONS };
}

const tokens = () => JSON.parse(readFileSync(TOKENS, "utf8"));
const light = (v) => (typeof v === "string" ? v : v.light);
const dark = (v) => (typeof v === "string" ? v : v.dark);

// The token section: what check.mjs holds kit.css to (it must contain this text exactly).
export function tokensCss() {
  const t = tokens();
  const colour = (pick) => t.color.tokens.map((c) => `  --${c.name}: ${pick(c.value)};`).join("\n");
  const shadow = (pick) => t.shadow.tokens.map((s) => `  --${s.name}: ${pick(s.value)};`).join("\n");
  const fam = t.type.families;
  const type = t.type.groups.flatMap((g) => g.styles.map((s) => {
    const lines = [`  --type-${s.name}: ${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${fam[g.family]};`];
    if (s.letterSpacing) lines.push(`  --type-${s.name}-ls: ${s.letterSpacing};`);
    return lines;
  })).flat().join("\n");
  const space = t.spacing.tokens.map((s) => `  --${s.name}: ${s.value};`).join("\n");
  const radius = t.radius.tokens.map((r) => `  --${r.name}: ${r.value};`).join("\n");
  const press = t.motion.tokens.find((m) => m.name === "press").value;
  const scale = press.match(/scale\(([\d.]+)\)/)[1];
  const transition = press.match(/transition:\s*([^;]+)/)[1].trim();
  const themeLight = `${colour(light)}\n${shadow(light)}\n  --show-on-light: block;\n  --show-on-dark: none;\n  color-scheme: light;`;
  const themeDark = `${colour(dark)}\n${shadow(dark)}\n  --show-on-light: none;\n  --show-on-dark: block;\n  color-scheme: dark;`;
  return `/* ===== tokens: generated from docs/frontend/tokens.json v${t.version} by kit.mjs; do not edit ===== */
:root {
  --font-sans: ${fam.sans};
  --font-serif: ${fam.serif};
${type}
${space}
${radius}
  --press-scale: ${scale};
  --press-transition: ${transition};
}
:root, [data-theme="light"] {
${themeLight}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${themeDark.replace(/^/gm, "  ")}
  }
}
[data-theme="dark"] {
${themeDark}
}
`;
}

function iconSvg(dir, name) {
  const file = join(dir, "dist/esm/icons", `${name}.mjs`);
  if (!existsSync(file)) throw new Error(`lucide-react has no icon "${name}" (${file})`);
  const src = readFileSync(file, "utf8");
  const alias = src.match(/from '\.\/([\w-]+)\.mjs'/);
  if (!src.includes("__iconData = ") && alias) return iconSvg(dir, alias[1]);
  const data = new Function(`return ${src.match(/const __iconData = (\{[\s\S]*?\n\});/)[1]}`)();
  const inner = data.node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key")
    .map(([k, v]) => `${k}='${v}'`).join(" ")}/>`).join("");
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>${inner}</svg>`;
}

export function iconsCss(dir) {
  const rows = Object.entries(iconMap()).map(([concept, lucide]) =>
    `[data-icon="${concept}"] { --i: url("data:image/svg+xml,${encodeURIComponent(iconSvg(dir, lucide)).replace(/'/g, "%27")}"); }`);
  return `/* ===== icons: Lucide (ISC), one per concept, from apps/web/lib/icons.tsx + kit.mjs ADDED_ICONS ===== */\n${rows.join("\n")}\n`;
}

function main() {
  const lucide = process.env.LUCIDE_DIR || join(ROOT, "apps/web/node_modules/lucide-react");
  let icons;
  if (existsSync(join(lucide, "dist/esm/icons"))) icons = iconsCss(lucide);
  else {
    const old = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    const at = old.indexOf("/* ===== icons:");
    const end = old.indexOf("/* ===== blocks:");
    if (at < 0 || end < 0) throw new Error(`no lucide-react at ${lucide} and no icon section to keep; set LUCIDE_DIR`);
    icons = old.slice(at, end);
    console.log(`kit.mjs: no lucide-react at ${lucide}; kept the icon section of kit.css as it was`);
  }
  const blocks = `/* ===== blocks: components.css ===== */\n${readFileSync(join(HERE, "components.css"), "utf8")}`;
  writeFileSync(OUT, `${tokensCss()}\n${icons}\n${blocks}`);
  console.log(`kit.mjs: wrote ${OUT} (${Object.keys(iconMap()).length} icons)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
