#!/usr/bin/env node
// Builds SPEC.md, scopes.md and the wireframes page (HTML) from the one screen inventory, screens.json.
//   node docs/frontend/build-spec.mjs [wireframes.html path] [wireframes url]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "screens.json"), "utf8"));
const head = readFileSync(join(here, "spec-head.md"), "utf8");
const outHtml = process.argv[2] ?? join(here, "wireframes.html");
const url = process.argv[3] ?? "(see docs/notes/frontend-landscape.md)";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = (a) => (a && a.length ? a.join(" · ") : "none");
const byId = Object.fromEntries(data.screens.map((s) => [s.id, s]));
const title = (id) => byId[id]?.title ?? id;

// Keeps the inventory honest: every element target is a screen, every slice names real screens,
// every screen that does not exist yet belongs to a slice.
const problems = [];
for (const s of data.screens) {
  for (const e of s.elements ?? []) if (e.to && !byId[e.to]) problems.push(`${s.id}: element "${e.label}" points at unknown screen "${e.to}"`);
  if (!s.elements?.length) problems.push(`${s.id}: no elements`);
}
const sliced = new Set(data.slices.flatMap((x) => x.screens));
for (const x of data.slices) for (const id of x.screens) if (!byId[id]) problems.push(`${x.id}: unknown screen ${id}`);
for (const s of data.screens) {
  const n = data.slices.filter((x) => x.screens.includes(s.id)).length;
  if (n !== 1) problems.push(`${s.id}: in ${n} slices (every screen belongs to exactly one)`);
}
for (const id of data.merged_slices ?? []) if (!data.slices.some((x) => x.id === id)) problems.push(`merged_slices names unknown slice ${id}`);
if (problems.length) {
  console.error("screens.json problems:\n  " + problems.join("\n  "));
  process.exit(1);
}

const elementLine = (e) => {
  const where = e.to ? ` → ${title(e.to)} (\`${byId[e.to].route}\`)` : "";
  const eff = e.effect ? `: ${e.effect}` : "";
  const roles = e.roles ? ` [${e.roles.join(", ")} only; absent and refused for others]` : "";
  const note = e.note ? ` (${e.note})` : "";
  return `- **${e.t}** ${e.label}${where}${eff}${roles}${note}`;
};

// ---- SPEC.md
const blocksTable = ["| Block | What it is |", "|---|---|", ...Object.entries(data.blocks).map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
const kindsTable = ["| Kind | What the test does with it |", "|---|---|", ...Object.entries(data.element_kinds).map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
const genericChecks = data.generic_checks.map((c, i) => `${i + 1}. ${c}`).join("\n");
const slicesTable = ["| Slice | What | Screens | Waits for |", "|---|---|---|---|", ...data.slices.map((x) => `| ${x.id} ${x.title} | ${x.what} | ${x.screens.length ? x.screens.map(title).join(", ") : "the frame and the blocks"} | ${x.waits_for} |`)].join("\n");
const screenSection = (s) =>
  [
    `#### ${s.title} \`${s.route}\``,
    `Who: ${s.who} · Phase: ${s.phase} · Backend: ${list(s.backend)} · Old page today: ${s.exists} · Slice: ${data.slices.find((x) => x.screens.includes(s.id))?.id}`,
    `Eyebrow: ${s.eyebrow}`,
    `Purpose: ${s.purpose}`,
    "Blocks, in order:",
    ...s.blocks.map(([b, note]) => `- **${b}**: ${note}`),
    `Rail (Connected to): ${list(s.rail)}${s.capture.length ? ` · Capture here: ${s.capture.join(", ")}` : ""}`,
    `Main action: ${s.main} · Next step: ${s.next}`,
    `Data: ${s.data}`,
    `Empty: ${s.empty} · Phone: ${s.phone}`,
    s.folds ? `Folds in: ${s.folds.join(", ")}` : null,
    `Every control on the screen (${s.elements.length}), and what the test does with each:`,
    ...s.elements.map(elementLine),
    "Done when (on top of the ten generic checks):",
    ...s.done_when.map((d) => `- ${d}`),
    "",
  ]
    .filter((x) => x !== null)
    .join("\n");
const screens = data.groups.map((g) => [`### ${g}`, ...data.screens.filter((s) => s.group === g).map(screenSection)].join("\n\n")).join("\n\n");
writeFileSync(
  join(here, "SPEC.md"),
  head
    .replace("BLOCKS_TABLE", blocksTable)
    .replace("GENERIC_CHECKS", genericChecks + "\n\nWhat the test does with each kind of control:\n\n" + kindsTable)
    .replace("SLICES_TABLE", slicesTable)
    .replace("SCREENS", screens)
    .replaceAll("WIREFRAMES_URL", url),
);

// ---- scopes.md: one paste-ready GitHub issue per slice, in the Scope form (What / Done when / Out of scope)
const scope = (x) => {
  const own = x.screens.flatMap((id) => byId[id].done_when.map((d) => `${title(id)}: ${d}`));
  const elements = x.screens.reduce((n, id) => n + byId[id].elements.length, 0);
  const all = x.screens.length
    ? [`Every one of the ${elements} controls listed for these screens in docs/frontend/screens.json behaves as its kind says (docs/frontend/SPEC.md §7), proved by the inventory test and the slice's own tests; the inventory test's completeness check finds no control outside the list and no listed control missing.`]
    : [];
  return [
    `## ${x.id}: ${x.title}`,
    "",
    `Tier ${x.tier}. Waits for: ${x.waits_for}. Specification: docs/frontend/SPEC.md; inventory: docs/frontend/screens.json; wireframes: ${url}.`,
    "",
    "### What",
    "",
    x.what,
    "",
    "### Done when",
    "",
    ...[...x.done_when, ...all, ...own].map((d, i) => `${i + 1}. ${d}`),
    "",
    "### Out of scope",
    "",
    x.out_of_scope,
    "",
  ].join("\n");
};
writeFileSync(
  join(here, "scopes.md"),
  [
    "# The frontend slices as scopes",
    "",
    "Generated from `screens.json` by `build-spec.mjs`; never edit by hand. Each section below is one GitHub issue in the Scope form,",
    "titled with its id (for example `UI-1: Tokens, frame and the inventory test`). Nimish adds `scope-locked`; the proof-writer turns",
    "every Done-when line into an executable check in `specs/<ID>/`; then the build starts. Lines that name a screen come from that",
    "screen's own `done_when`; the generic checks of SPEC §7 apply to every screen a slice builds, and are what the inventory test runs.",
    "",
    ...data.slices.map(scope),
  ].join("\n"),
);

// ---- wireframes.html: a low-fidelity frame per screen, grouped by door, with every control listed
const who = { educator: "educator", coordinator: "coordinator", both: "everyone" };
const ctl = (e) => `<li><b>${esc(e.t)}</b> ${esc(e.label)}${e.to ? ` <span class="to">→ ${esc(title(e.to))}</span>` : ""}${e.effect ? ` <span class="eff">${esc(e.effect)}</span>` : ""}${e.roles ? ` <span class="role">${esc(e.roles.join(", "))} only</span>` : ""}</li>`;
const frame = (s) => `
<article class="wf" id="${s.id}">
  <header><span class="route">${esc(s.route)}</span><span class="meta">${who[s.who]} · ${esc(s.phase)}${s.backend.length ? " · " + s.backend.join(", ") : ""} · exists: ${esc(s.exists)}</span></header>
  <div class="bar"><b></b>Cornerstone ${["Today", "Timetable", "Children", "Setup"].map((g) => `<span class="g${s.group === g ? " on" : ""}">${g}</span>`).join("")}<i class="search">Sr. No. or activity</i></div>
  <div class="trail">‹ Back › … › <strong>${esc(s.title)}</strong></div>
  <div class="body">
    <div class="main">
      <div class="eyebrow">${esc(s.eyebrow)}</div>
      <h3>${esc(s.title)}</h3>
      <p class="purpose">${esc(s.purpose)}</p>
      <div class="action">▶ ${esc(s.main)}</div>
      ${s.blocks.map(([b, note]) => `<div class="block"><span class="tag">${esc(b)}</span><span>${esc(note)}</span></div>`).join("")}
      <div class="next">→ ${esc(s.next)}</div>
    </div>
    <aside class="rail"><h4>Connected to</h4>${s.rail.length ? s.rail.map((r) => `<div>${esc(r)}</div>`).join("") : '<div class="none">none</div>'}<h4>Capture here</h4>${s.capture.length ? s.capture.map((c) => `<div class="cap">${c === "voice" ? "voice note" : "photo"}</div>`).join("") : '<div class="none">not here</div>'}</aside>
  </div>
  <details class="controls"><summary>Every control (${s.elements.length}) and what the test does with it</summary><ul>${s.elements.map(ctl).join("")}</ul></details>
  <footer><div><b>Data:</b> ${esc(s.data)}</div><div><b>Empty:</b> ${esc(s.empty)} · <b>Phone:</b> ${esc(s.phone)}</div>${s.folds ? `<div><b>Folds in:</b> ${esc(s.folds.join(", "))}</div>` : ""}<div><b>Done when:</b> ${s.done_when.map(esc).join("; ")}</div></footer>
</article>`;

const toc = data.groups.map((g) => `<div class="toc-g"><b>${g}</b>${data.screens.filter((s) => s.group === g).map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join("")}</div>`).join("");
const total = data.screens.reduce((n, s) => n + s.elements.length, 0);
const html = `<title>School OS wireframes</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap">
<style>
:root { --bg:#fff; --surface:#f7f7f5; --ink:#1c1b19; --muted:#5e5a52; --line:#e4e3df; --strong:#8a8984; --accent:#b8562f; --accent-bg:rgba(184,86,47,.08); --ok:#4a5435; --sans:"Source Sans 3",system-ui,sans-serif; --serif:"Source Serif 4",Georgia,serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme:dark; --bg:#171614; --surface:#1f1e1b; --ink:#ece9e2; --muted:#a09e97; --line:#2d2c28; --strong:#8e8c86; --accent:#e0855c; --accent-bg:rgba(224,133,92,.12); --ok:#a9b88a; } }
:root[data-theme="dark"] { color-scheme:dark; --bg:#171614; --surface:#1f1e1b; --ink:#ece9e2; --muted:#a09e97; --line:#2d2c28; --strong:#8e8c86; --accent:#e0855c; --accent-bg:rgba(224,133,92,.12); --ok:#a9b88a; }
* { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 var(--sans); }
.wrap { max-width:1200px; margin:0 auto; padding-block:32px 80px; padding-left:max(16px,env(safe-area-inset-left,0px)); padding-right:max(16px,env(safe-area-inset-right,0px)); display:grid; gap:28px; }
h1 { font:600 2rem/1.2 var(--serif); margin:0; } .lede { color:var(--muted); max-width:80ch; margin:6px 0 0; }
h2 { font:600 1.4rem var(--serif); margin:24px 0 0; border-bottom:1px solid var(--line); padding-bottom:6px; }
.toc { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; font-size:13px; } .toc-g { display:grid; gap:3px; align-content:start; } .toc-g b { margin-bottom:3px; } .toc a { color:var(--muted); text-decoration:none; } .toc a:hover { color:var(--ink); text-decoration:underline; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(560px,1fr)); gap:20px; }
.wf { border:1px solid var(--strong); background:var(--bg); display:grid; grid-template-rows:auto auto auto 1fr auto auto; font-size:12px; }
.wf header { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:6px 10px; background:var(--surface); border-bottom:1px solid var(--line); color:var(--muted); } .route { font-weight:600; color:var(--ink); font-family:ui-monospace,monospace; }
.bar { display:flex; gap:10px; align-items:center; padding:6px 10px; border-bottom:1px solid var(--line); font-weight:600; } .bar b { width:8px; height:8px; background:var(--accent); display:inline-block; } .bar .g { font-weight:500; color:var(--muted); padding:2px 0; border-bottom:2px solid transparent; } .bar .g.on { color:var(--ink); border-color:var(--accent); } .bar .search { margin-left:auto; font-style:normal; color:var(--muted); border:1px solid var(--strong); padding:2px 8px; font-weight:400; }
.trail { padding:4px 10px; background:var(--surface); border-bottom:1px solid var(--line); color:var(--muted); }
.body { display:grid; grid-template-columns:1fr 160px; min-height:260px; } .main { padding:10px 12px; display:grid; gap:6px; align-content:start; }
.eyebrow { font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; } .main h3 { margin:0; font:600 18px/1.2 var(--serif); } .purpose { margin:0; color:var(--muted); }
.action { display:inline-block; justify-self:start; padding:5px 10px; background:var(--ink); color:var(--bg); font-weight:600; }
.block { display:grid; grid-template-columns:110px 1fr; gap:8px; padding:7px 9px; border:1px dashed var(--strong); background:repeating-linear-gradient(45deg,transparent 0 6px,var(--surface) 6px 12px); } .tag { font-weight:600; color:var(--accent); }
.next { color:var(--accent); font-weight:500; }
.rail { border-left:1px solid var(--line); background:var(--surface); padding:10px; display:grid; gap:4px; align-content:start; } .rail h4 { margin:4px 0 2px; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); } .rail div { border:1px solid var(--line); background:var(--bg); padding:3px 6px; } .rail .none { border-style:dashed; color:var(--muted); } .rail .cap { border-color:var(--accent); background:var(--accent-bg); }
.controls { border-top:1px solid var(--line); } .controls summary { cursor:pointer; padding:7px 10px; font-weight:600; color:var(--ink); background:var(--surface); } .controls ul { margin:0; padding:8px 10px 8px 26px; display:grid; gap:3px; } .controls li b { color:var(--accent); } .controls .to { color:var(--ok); } .controls .eff { color:var(--muted); } .controls .role { color:var(--accent); font-weight:600; }
.wf footer { border-top:1px solid var(--line); padding:8px 10px; display:grid; gap:3px; color:var(--muted); font-size:11.5px; } .wf footer b { color:var(--ink); }
@media (max-width:640px) { .grid { grid-template-columns:1fr; } .body { grid-template-columns:1fr; } .rail { border-left:0; border-top:1px solid var(--line); } }
</style>
<div class="wrap">
  <header><div class="eyebrow">Cornerstone · frontend specification · wireframes · 09-Nov-2026</div><h1>Every screen of the school's site</h1>
  <p class="lede">${data.screens.length} screens behind four doors, ${total} controls in all. Each frame shows the top bar with its door lit, the trail, the title block, the one main action, the blocks in order (what each shows and from where), the rail of connections and capture buttons, then every control with what the test does when it clicks it, and the data, the empty state, the phone, the old pages that fold in, and what must be true before it is done. Generated from <code>docs/frontend/screens.json</code>; the written specification is <code>docs/frontend/SPEC.md</code>, the scopes <code>docs/frontend/scopes.md</code>.</p></header>
  <nav class="toc">${toc}</nav>
  ${data.groups.map((g) => `<section><h2>${g}</h2><div class="grid">${data.screens.filter((s) => s.group === g).map(frame).join("")}</div></section>`).join("")}
</div>`;
writeFileSync(outHtml, html);
console.log(`SPEC.md: ${data.screens.length} screens, ${total} controls, ${Object.keys(data.blocks).length} blocks, ${data.slices.length} slices; scopes.md; wireframes: ${outHtml}`);
