#!/usr/bin/env node
// check.mjs: holds every wireframe to the kit. No dependencies.
//   node docs/frontend/wireframes/check.mjs                 check every <screen-id>.html, blocks.html and kit.css
//   node docs/frontend/wireframes/check.mjs picture.html    check one wireframe (plus kit.css and the hex rule)
//   node docs/frontend/wireframes/check.mjs --gaps          list screens.json data names missing from the target tables,
//                                                           and fail if DATA-GAPS.md does not name each one
// A wireframe fails when: a control of its screens.json `elements` (or of the bar) is missing or extra in either
// frame, or is drawn as the wrong kind of control; a data-source names a table not in specs/CP-27/target-tables.md, or a
// column the migrations do not have (when the table exists today, and provisional.json does not list it); a data-gap is
// empty; a colour is typed outside kit.css; a gap, padding or margin in components.css is not a spacing token; a style
// attribute sets anything but a --custom-property; a shown name is not in fake-names.json.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSchema } from "./schema.mjs";
import { tokensCss, spacingTokens } from "./kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const SCREENS = JSON.parse(readFileSync(join(ROOT, "docs/frontend/screens.json"), "utf8"));
const TARGET = new Set(readFileSync(join(ROOT, "specs/CP-27/target-tables.md"), "utf8").match(/```\n([\s\S]*?)```/)[1].split("\n").filter(Boolean));
const SCHEMA = loadSchema(join(ROOT, "supabase/migrations"));
const FAKE = JSON.parse(readFileSync(join(HERE, "fake-names.json"), "utf8"));
// Columns the backend decided in #551 but has not built: a data-source may name one (a note, not an error).
const PROVISIONAL = JSON.parse(readFileSync(join(HERE, "provisional.json"), "utf8")).columns;
const FAKE_WORDS = new Set(Object.values(FAKE).filter(Array.isArray).flat().flatMap((n) => n.split(/\s+/)));
const NOT_WIREFRAMES = new Set(["blocks.html"]);

// ---------- a small HTML tree ----------
const VOID = new Set("area base br col embed hr img input link meta source track wbr".split(" "));
export function parse(html) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    if (m[1]) { cur.children.push({ tag: m[1].toLowerCase(), attrs: attrs(m[2]), children: [], parent: cur, raw: m[3] }); continue; }
    if (m[8] !== undefined) { cur.children.push({ text: m[8], parent: cur }); continue; }
    if (!m[5]) continue;
    const tag = m[5].toLowerCase();
    if (m[4]) { let n = cur; while (n && n.tag !== tag) n = n.parent; if (n) cur = n.parent; continue; }
    const node = { tag, attrs: attrs(m[6]), children: [], parent: cur };
    cur.children.push(node);
    if (!VOID.has(tag) && !m[7]) cur = node;
  }
  return root;
}
function attrs(s = "") {
  const o = {};
  for (const m of s.matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) o[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return o;
}
const all = (n, out = []) => { for (const c of n.children || []) { if (c.tag) { out.push(c); all(c, out); } } return out; };
const text = (n) => (n.text !== undefined ? n.text : (n.children || []).map(text).join(" ")).replace(/\s+/g, " ").trim();
const hasClass = (n, c) => (n.attrs?.class || "").split(/\s+/).includes(c);

const INTERACTIVE = (n) => ["a", "button", "input", "select", "textarea", "summary"].includes(n.tag) || ["button", "switch", "tab"].includes(n.attrs.role);
const KIND_TAGS = {
  link: (n) => n.tag === "a", row: (n) => n.tag === "a" || n.tag === "tr", cell: (n) => n.tag === "a" || n.tag === "button",
  tab: (n) => n.attrs.role === "tab", button: (n) => n.tag === "button", fold: (n) => n.tag === "summary",
  filter: (n) => n.tag === "select" || n.tag === "input", field: (n) => ["input", "select", "textarea"].includes(n.tag),
  switch: (n) => n.attrs.role === "switch" || n.attrs.type === "checkbox", upload: (n) => n.tag === "input" && n.attrs.type === "file",
  peek: (n) => n.tag === "button",
  child_name: (n) => !INTERACTIVE(n),
};
const BAR_KIND = { link: "link", field: "field", switch: "switch", button: "button" };

// ---------- the rules ----------
function checkSource(src, where, errs, notes) {
  for (const s of src.split(/\s+/).filter(Boolean)) {
    const parts = s.split(".");
    const table = parts[0] === "pii" ? `pii.${parts[1]}` : parts[0];
    const col = parts[0] === "pii" ? parts[2] : parts[1];
    if (!TARGET.has(table)) {
      if (SCHEMA.views.has(table)) notes.add(`${s}: a view today; it is not a table, so DATA-GAPS.md must say whether it survives CP-27`);
      else errs.push(`${where}: data-source "${s}": "${table}" is not one of the target tables (specs/CP-27/target-tables.md)`);
      continue;
    }
    if (!col) { errs.push(`${where}: data-source "${s}" names no column (write table.column)`); continue; }
    const cols = SCHEMA.tables.get(table);
    if (!cols) notes.add(`${table}: a target table not built yet, so "${col}" is not checked`);
    else if (!cols.has(col)) {
      if ((PROVISIONAL[table] || []).includes(col)) notes.add(`${table}.${col}: provisional, decided in #551 and not built yet (provisional.json)`);
      else errs.push(`${where}: data-source "${s}": the migrations give ${table} no column "${col}" (and provisional.json does not list it)`);
    }
  }
}

function checkNames(n, where, errs) {
  for (const w of text(n).split(/[^A-Za-z'-]+/).filter(Boolean)) {
    if (!FAKE_WORDS.has(w)) errs.push(`${where}: shown name "${w}" is not in fake-names.json`);
  }
}

export function checkHex(file, src, errs) {
  const body = src.replace(/\shref="[^"]*"/g, "").replace(/\sid="[^"]*"/g, "");
  for (const m of body.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab)\(/g)) {
    errs.push(`${file}: a colour typed outside kit.css: "${m[0]}" (use a token class or var(--token))`);
  }
  for (const m of src.matchAll(/\sstyle="([^"]*)"/g)) {
    for (const decl of m[1].split(";").map((d) => d.trim()).filter(Boolean)) {
      if (!decl.startsWith("--")) errs.push(`${file}: style="${m[1]}": only --custom-properties may be set inline`);
    }
  }
}

// Revision 1 (issue #546): a gap, a padding or a margin in the kit is a spacing token (or 0, or auto), never a typed length.
export function checkSpacing(file, css, errs) {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of body.matchAll(/(?:^|[;{\s])((?:row-|column-)?gap|(?:padding|margin)(?:-[a-z]+)?)\s*:\s*([^;}]+)/g)) {
    const left = m[2].replace(/var\(--(?:space-\d+|tap)\)/g, "").replace(/calc\(|\)|[+*\/\s-]/g, "");
    if (left && !/^(0|auto)+$/.test(left)) errs.push(`${file}: "${m[1]}: ${m[2].trim()}" is not a spacing token (use var(--space-0) … var(--space-7), 0 or auto)`);
  }
}

function checkSpacingScale(errs) {
  const px = spacingTokens().filter((t) => /^space-\d+$/.test(t.name)).map((t) => parseInt(t.value, 10));
  if (px.some((v, i) => !(v > 0) || (i && v <= px[i - 1]))) errs.push(`spacing.json: the scale must rise in whole pixels (got ${px.join(", ")})`);
}

function checkFrame(frame, screen, label, errs) {
  const n = screen.elements.length;
  const nodes = all(frame);
  const seen = new Set();
  const barSeen = new Set();
  let controls = 0;
  for (const node of nodes) {
    const el = node.attrs["data-el"];
    const bar = node.attrs["data-bar"];
    if (el !== undefined) {
      const i = Number(el);
      if (!Number.isInteger(i) || i < 0 || i >= n) { errs.push(`${label}: data-el="${el}" is not an index of ${screen.id}'s ${n} elements`); continue; }
      seen.add(i);
      const kind = screen.elements[i].t;
      if (KIND_TAGS[kind] && !KIND_TAGS[kind](node)) errs.push(`${label}: data-el="${i}" is a ${kind} ("${screen.elements[i].label}") but is drawn as <${node.tag}>`);
      if (kind === "child_name") checkNames(node, `${label} data-el="${i}"`, errs);
    } else if (bar !== undefined) {
      const i = Number(bar);
      if (!Number.isInteger(i) || i < 0 || i >= SCREENS.bar.length) { errs.push(`${label}: data-bar="${bar}" is not an index of the bar`); continue; }
      barSeen.add(i);
      const kind = BAR_KIND[SCREENS.bar[i].t];
      if (kind && !KIND_TAGS[kind](node)) errs.push(`${label}: data-bar="${i}" is a ${kind} ("${SCREENS.bar[i].label}") but is drawn as <${node.tag}>`);
    } else if (node.attrs["data-trail"] !== undefined && node.tag === "a") {
      // the trail: the door, then the thing (SPEC §3); outside the main column and the rail, like the bar
    } else if (INTERACTIVE(node)) {
      errs.push(`${label}: an extra control <${node.tag}> "${text(node).slice(0, 40)}" is on no element of ${screen.id} and not in the bar`);
    }
    if (INTERACTIVE(node)) controls++;
    if (node.attrs["data-gap"] !== undefined && !node.attrs["data-gap"].trim()) errs.push(`${label}: an empty data-gap (say what is missing)`);
  }
  for (let i = 0; i < n; i++) if (!seen.has(i)) errs.push(`${label}: element ${i} (${screen.elements[i].t} "${screen.elements[i].label}") is missing`);
  if (screen.frame !== "bare") for (let i = 0; i < SCREENS.bar.length; i++) if (!barSeen.has(i)) errs.push(`${label}: bar item ${i} ("${SCREENS.bar[i].label}") is missing`);
  return { elements: seen.size, n, bar: barSeen.size, controls };
}

export function checkWireframe(file) {
  const errs = [];
  const notes = new Set();
  const id = basename(file, ".html");
  const html = readFileSync(file, "utf8");
  const screen = SCREENS.screens.find((s) => s.id === id);
  if (!screen) return { errs: [`${id}.html: no screen "${id}" in screens.json`], notes, summary: "" };
  checkHex(`${id}.html`, html, errs);
  const tree = parse(html);
  const nodes = all(tree);
  if (!nodes.some((x) => x.tag === "link" && /(^|\/)kit\.css$/.test(x.attrs.href || ""))) errs.push(`${id}.html: does not link kit.css`);
  if (nodes.some((x) => x.tag === "style" || x.tag === "script")) errs.push(`${id}.html: a <style> or <script>; a wireframe uses kit.css only`);
  const summary = [];
  for (const vp of ["1440", "400"]) {
    const frame = nodes.find((x) => hasClass(x, "wf") && x.attrs["data-viewport"] === vp);
    if (!frame) { errs.push(`${id}.html: no frame <section class="wf" data-viewport="${vp}">`); continue; }
    const r = checkFrame(frame, screen, `${id}.html@${vp}`, errs);
    summary.push(`${vp}: ${r.elements}/${r.n} elements, ${r.bar}/${SCREENS.bar.length} bar, ${r.controls} controls`);
  }
  let sources = 0, gaps = 0;
  for (const x of nodes) {
    if (x.attrs["data-source"] !== undefined) {
      sources++;
      checkSource(x.attrs["data-source"], `${id}.html`, errs, notes);
      if (/\bpii\.\w+\.(first_name|last_name|name)\b/.test(x.attrs["data-source"])) checkNames(x, `${id}.html data-source`, errs);
    }
    if (x.attrs["data-gap"] !== undefined) gaps++;
  }
  summary.push(`${sources} data-sources, ${gaps} gaps`);
  return { errs, notes, summary: summary.join("; ") };
}

function checkBlocks(errs) {
  const html = readFileSync(join(HERE, "blocks.html"), "utf8");
  checkHex("blocks.html", html, errs);
  const nodes = all(parse(html));
  const drawn = nodes.map((x) => x.attrs["data-block"]).filter(Boolean);
  const want = Object.keys(SCREENS.blocks);
  for (const b of want) if (drawn.filter((d) => d === b).length !== 1) errs.push(`blocks.html: block ${b} drawn ${drawn.filter((d) => d === b).length} times (want once)`);
  for (const d of new Set(drawn)) if (!want.includes(d)) errs.push(`blocks.html: data-block="${d}" is not a block in screens.json`);
  const notes = new Set();
  for (const x of nodes) {
    if (x.attrs["data-source"] !== undefined) checkSource(x.attrs["data-source"], "blocks.html", errs, notes);
    if (/\bpii\.\w+\.(first_name|last_name|name)\b/.test(x.attrs["data-source"] || "")) checkNames(x, "blocks.html", errs);
  }
  return `${want.length}/${want.length} blocks drawn once`;
}

// The gap list: every name in a screen's `data` that is a table or view today (or snake_case) and is not a target table.
export function gaps() {
  const cols = new Set([...TARGET].flatMap((t) => [...(SCHEMA.tables.get(t) || [])]).concat(Object.values(PROVISIONAL).flat()));
  const out = [];
  for (const s of SCREENS.screens) {
    const found = new Set();
    for (const tok of s.data.match(/\b[a-z][a-z0-9_]*(?:\.[a-z_]+)?/g) || []) {
      const name = tok.startsWith("pii.") ? tok.split(".").slice(0, 2).join(".") : tok.split(".")[0];
      const known = SCHEMA.tables.has(name) || SCHEMA.views.has(name);
      if (!known && !name.includes("_")) continue;
      if (TARGET.has(name) || TARGET.has(`pii.${name}`)) continue;
      if (!known && cols.has(name)) continue;
      found.add(name);
    }
    for (const g of found) out.push({ screen: s.id, name: g, what: SCHEMA.views.has(g) ? "view" : SCHEMA.tables.has(g) ? "table" : "name" });
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const errs = [];
  if (args.includes("--gaps")) {
    const doc = readFileSync(join(HERE, "DATA-GAPS.md"), "utf8");
    const list = gaps();
    for (const g of list) {
      const named = doc.split("\n").some((l) => l.includes(`\`${g.screen}\``) && l.includes(`\`${g.name}\``));
      console.log(`${named ? "ok  " : "MISS"} ${g.screen}: ${g.name} (${g.what})`);
      if (!named) errs.push(`DATA-GAPS.md has no row naming \`${g.screen}\` and \`${g.name}\``);
    }
    const screens = new Set(list.map((g) => g.screen));
    console.log(`${list.length} gaps on ${screens.size} screens`);
  } else {
    const kit = readFileSync(join(HERE, "kit.css"), "utf8");
    if (!kit.includes(tokensCss())) errs.push("kit.css: its token section is not what kit.mjs makes from tokens.json; run node docs/frontend/wireframes/kit.mjs");
    const components = readFileSync(join(HERE, "components.css"), "utf8");
    checkHex("components.css", components, errs);
    checkSpacing("components.css", components, errs);
    checkSpacingScale(errs);
    const files = args.length ? args.map((a) => resolve(HERE, basename(a))) : readdirSync(HERE).filter((f) => f.endsWith(".html") && !NOT_WIREFRAMES.has(f)).map((f) => join(HERE, f));
    if (!args.length) console.log(`blocks.html: ${checkBlocks(errs)}`);
    for (const f of files) {
      const r = checkWireframe(f);
      errs.push(...r.errs);
      console.log(`${r.errs.length ? "FAIL" : "PASS"} ${basename(f)}: ${r.summary}`);
      for (const n of r.notes) console.log(`  note: ${n}`);
    }
  }
  for (const e of errs) console.log(`  ✗ ${e}`);
  console.log(errs.length ? `check.mjs: ${errs.length} problem(s)` : "check.mjs: all clear");
  process.exit(errs.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
