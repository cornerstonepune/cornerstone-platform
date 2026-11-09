#!/usr/bin/env node
// Builds SPEC.md (from spec-head.md + screens.json) and a wireframes page (HTML) from the one screen inventory.
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

// ---- SPEC.md
const blocksTable = ["| Block | What it is |", "|---|---|", ...Object.entries(data.blocks).map(([k, v]) => `| ${k} | ${v} |`)].join("\n");
const screens = data.groups
  .map((g) => {
    const rows = data.screens.filter((s) => s.group === g);
    return [
      `### ${g}`,
      ...rows.map((s) =>
        [
          `#### ${s.title} \`${s.route}\``,
          `Who: ${s.who} · Phase: ${s.phase} · Backend: ${list(s.backend)} · Exists today: ${s.exists}`,
          `Eyebrow: ${s.eyebrow}`,
          `Purpose: ${s.purpose}`,
          "Blocks, in order:",
          ...s.blocks.map(([b, note]) => `- **${b}**: ${note}`),
          `Rail (Connected to): ${list(s.rail)}${s.capture.length ? ` · Capture here: ${s.capture.join(", ")}` : ""}`,
          `Main action: ${s.main} · Next step: ${s.next}`,
          `Data: ${s.data}`,
          `Empty: ${s.empty} · Phone: ${s.phone}`,
          s.folds ? `Folds in: ${s.folds.join(", ")}` : null,
          "Done when:",
          ...s.done_when.map((d) => `- ${d}`),
          "",
        ].filter((x) => x !== null).join("\n"),
      ),
    ].join("\n\n");
  })
  .join("\n\n");
writeFileSync(join(here, "SPEC.md"), head.replace("BLOCKS_TABLE", blocksTable).replace("SCREENS", screens).replaceAll("WIREFRAMES_URL", url));

// ---- wireframes.html: a low-fidelity frame per screen, grouped by door
const who = { educator: "educator", coordinator: "coordinator", both: "everyone" };
const frame = (s) => `
<article class="wf" id="${s.id}">
  <header><span class="route">${esc(s.route)}</span><span class="meta">${who[s.who]} · ${esc(s.phase)}${s.backend.length ? " · " + s.backend.join(", ") : ""} · exists: ${esc(s.exists)}</span></header>
  <div class="bar"><b></b>Cornerstone <span class="g${s.group === "Today" ? " on" : ""}">Today</span><span class="g${s.group === "Timetable" ? " on" : ""}">Timetable</span><span class="g${s.group === "Children" ? " on" : ""}">Children</span><span class="g${s.group === "Setup" ? " on" : ""}">Setup</span><i class="search">Sr. No. or activity</i></div>
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
  <footer><div><b>Data:</b> ${esc(s.data)}</div><div><b>Empty:</b> ${esc(s.empty)} · <b>Phone:</b> ${esc(s.phone)}</div>${s.folds ? `<div><b>Folds in:</b> ${esc(s.folds.join(", "))}</div>` : ""}<div><b>Done when:</b> ${s.done_when.map(esc).join("; ")}</div></footer>
</article>`;

const toc = data.groups.map((g) => `<div class="toc-g"><b>${g}</b>${data.screens.filter((s) => s.group === g).map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join("")}</div>`).join("");
const html = `<title>School OS wireframes</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&display=swap">
<style>
:root { --bg:#fff; --surface:#f7f7f5; --ink:#1c1b19; --muted:#5e5a52; --line:#e4e3df; --strong:#8a8984; --accent:#b8562f; --accent-bg:rgba(184,86,47,.08); --sans:"Source Sans 3",system-ui,sans-serif; --serif:"Source Serif 4",Georgia,serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { color-scheme:dark; --bg:#171614; --surface:#1f1e1b; --ink:#ece9e2; --muted:#a09e97; --line:#2d2c28; --strong:#8e8c86; --accent:#e0855c; --accent-bg:rgba(224,133,92,.12); } }
:root[data-theme="dark"] { color-scheme:dark; --bg:#171614; --surface:#1f1e1b; --ink:#ece9e2; --muted:#a09e97; --line:#2d2c28; --strong:#8e8c86; --accent:#e0855c; --accent-bg:rgba(224,133,92,.12); }
* { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 var(--sans); }
.wrap { max-width:1200px; margin:0 auto; padding-block:32px 80px; padding-left:max(16px,env(safe-area-inset-left,0px)); padding-right:max(16px,env(safe-area-inset-right,0px)); display:grid; gap:28px; }
h1 { font:600 2rem/1.2 var(--serif); margin:0; } .lede { color:var(--muted); max-width:80ch; margin:6px 0 0; }
h2 { font:600 1.4rem var(--serif); margin:24px 0 0; border-bottom:1px solid var(--line); padding-bottom:6px; }
.toc { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; font-size:13px; } .toc-g { display:grid; gap:3px; align-content:start; } .toc-g b { margin-bottom:3px; } .toc a { color:var(--muted); text-decoration:none; } .toc a:hover { color:var(--ink); text-decoration:underline; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(560px,1fr)); gap:20px; }
.wf { border:1px solid var(--strong); background:var(--bg); display:grid; grid-template-rows:auto auto auto 1fr auto; font-size:12px; }
.wf header { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:6px 10px; background:var(--surface); border-bottom:1px solid var(--line); color:var(--muted); } .route { font-weight:600; color:var(--ink); font-family:ui-monospace,monospace; }
.bar { display:flex; gap:10px; align-items:center; padding:6px 10px; border-bottom:1px solid var(--line); font-weight:600; } .bar b { width:8px; height:8px; background:var(--accent); display:inline-block; } .bar .g { font-weight:500; color:var(--muted); padding:2px 0; border-bottom:2px solid transparent; } .bar .g.on { color:var(--ink); border-color:var(--accent); } .bar .search { margin-left:auto; font-style:normal; color:var(--muted); border:1px solid var(--strong); padding:2px 8px; font-weight:400; }
.trail { padding:4px 10px; background:var(--surface); border-bottom:1px solid var(--line); color:var(--muted); }
.body { display:grid; grid-template-columns:1fr 160px; min-height:260px; } .main { padding:10px 12px; display:grid; gap:6px; align-content:start; }
.eyebrow { font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; } .main h3 { margin:0; font:600 18px/1.2 var(--serif); } .purpose { margin:0; color:var(--muted); }
.action { display:inline-block; justify-self:start; padding:5px 10px; background:var(--ink); color:var(--bg); font-weight:600; }
.block { display:grid; grid-template-columns:110px 1fr; gap:8px; padding:7px 9px; border:1px dashed var(--strong); background:repeating-linear-gradient(45deg,transparent 0 6px,var(--surface) 6px 12px); } .tag { font-weight:600; color:var(--accent); }
.next { color:var(--accent); font-weight:500; }
.rail { border-left:1px solid var(--line); background:var(--surface); padding:10px; display:grid; gap:4px; align-content:start; } .rail h4 { margin:4px 0 2px; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); } .rail div { border:1px solid var(--line); background:var(--bg); padding:3px 6px; } .rail .none { border-style:dashed; color:var(--muted); } .rail .cap { border-color:var(--accent); background:var(--accent-bg); }
.wf footer { border-top:1px solid var(--line); padding:8px 10px; display:grid; gap:3px; color:var(--muted); font-size:11.5px; } .wf footer b { color:var(--ink); }
@media (max-width:640px) { .grid { grid-template-columns:1fr; } .body { grid-template-columns:1fr; } .rail { border-left:0; border-top:1px solid var(--line); } }
</style>
<div class="wrap">
  <header><div class="eyebrow">Cornerstone · frontend specification · wireframes · 09-Nov-2026</div><h1>Every screen of the school's site</h1>
  <p class="lede">${data.screens.length} screens behind four doors. Each frame shows the top bar with its door lit, the trail, the title block, the one main action, the blocks in order (what each shows and from where), the rail of connections and capture buttons, then the data, the empty state, the phone, the old pages that fold in, and what must be true before it is done. Generated from <code>docs/frontend/screens.json</code>; the written specification is <code>docs/frontend/SPEC.md</code>.</p></header>
  <nav class="toc">${toc}</nav>
  ${data.groups.map((g) => `<section><h2>${g}</h2><div class="grid">${data.screens.filter((s) => s.group === g).map(frame).join("")}</div></section>`).join("")}
</div>`;
writeFileSync(outHtml, html);
console.log(`SPEC.md: ${data.screens.length} screens, ${Object.keys(data.blocks).length} blocks; wireframes: ${outHtml}`);
