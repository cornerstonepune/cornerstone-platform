/**
 * U70 (UI-13), Done when 11 and 12 — the inventory test is proved on tests/fixtures/mini-inventory.json, two pages that exist and
 * are framed by this slice: it passes on them, and a deliberately broken copy (a missing control, a dead link, a name not in the
 * allow-list) fails with the reason named.
 */
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import path from "node:path";
import { FAKE_FIRST_NAMES, FAKE_NAMES } from "./fake-names";
import { inventoryRows, SECTION, type Rows } from "./inventory-fixtures";
import { acrossGone, acrossRest } from "./inventory-across";
import { loadInventory, type Inventory } from "./inventory/load";
import { auditScreen } from "./inventory/run";

const mini = () => loadInventory(path.join(__dirname, "fixtures/mini-inventory.json"));
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
let rows: Rows;
test.beforeAll(async () => {
  rows = await inventoryRows(sql);
  // the page the proof audits lists a class's row: the fixture class has a paper out, a waiting answer and a child needing help
  await acrossRest((f) => f(sql), SECTION);
});
test.afterAll(async () => {
  await acrossGone((f) => f(sql));
  await sql.end();
});
const allow = [...FAKE_NAMES, ...FAKE_FIRST_NAMES];
const audit = (browser: Parameters<typeof auditScreen>[0], inv: Inventory, id: string, role: "educator" | "coordinator" = "coordinator", names: string[] = [], address?: Record<string, string>) =>
  auditScreen(browser, inv.screens.find((s) => s.id === id)!, role, 1440, { inv, rows, allow, names, address });

test("the mini inventory passes on both of its screens, as the educator and as the coordinator, at 1440 and at 400", async ({ browser }) => {
  test.setTimeout(300_000);
  const inv = mini();
  for (const s of inv.screens)
    for (const role of ["educator", "coordinator"] as const)
      for (const width of [1440, 400]) expect(await auditScreen(browser, s, role, width, { inv, rows, allow, names: [] }), `${s.id} ${role} ${width}`).toEqual([]);
});

test("a control the inventory lists and the page lacks fails, naming the control", async ({ browser }) => {
  const inv = mini();
  inv.screens[0].elements.push({ t: "button", label: "Approve everything", href: "/nowhere" });
  const problems = await audit(browser, inv, "across");
  expect(problems.join("\n")).toContain("missing control — “Approve everything”");
});

test("a link that lands on the wrong screen fails as a dead link, naming both headings", async ({ browser }) => {
  const inv = mini();
  inv.screens[0].elements[0] = { t: "link", label: "Check answers", href: "/children/assessments?status=check", to: "feedback" };
  const problems = await audit(browser, inv, "across");
  expect(problems.join("\n")).toMatch(/“Check answers” did not land on feedback: its h1 is “Assessments”, expected “Report a problem or suggest something” \(a dead link\)/);
});

test("a child's name that is not in tests/fake-names.ts fails, naming the name", async ({ browser }) => {
  const inv = mini();
  inv.screens.push({ id: "child", route: "/growth/[id]", group: "Children", who: "both", title: "[name]", elements: [] });
  const first = Object.keys(rows.children)[0];
  const shown = first.split(" ")[0];
  // the allow-list without the name the page shows, as it would be if a real child's name had been put in a fixture
  const problems = await auditScreen(browser, inv.screens.at(-1)!, "coordinator", 1440, { inv, rows, allow: allow.filter((n) => n !== shown && n !== first), names: [shown] });
  expect(problems.join("\n")).toContain(`the name “${shown}” is on the page and is not in tests/fake-names.ts`);
});

// ---- UI-1b: the checker drives real screens. The pages below are served by the test itself (no app code), small enough to show each rule.
import type { Page } from "@playwright/test";
import { completeness, drive, keyboard } from "./inventory/checks";
import type { Element, Screen } from "./inventory/load";

const ORIGIN = "http://localhost:3100";
const PEEK_JS = (restore: boolean) => `
  const q = new URLSearchParams(location.search);
  const slot = document.getElementById("slot");
  function open(btn) {
    slot.innerHTML = '<aside data-block="ChildPeek"><button type="button" id="close">Close</button> <a href="/__proof/child">Open the child</a></aside>';
    document.getElementById("close").focus();
    history.replaceState(null, "", "?peek=1"); window.__opener = btn;
    document.getElementById("close").onclick = close;
  }
  function close() { slot.innerHTML = ""; history.replaceState(null, "", location.pathname); ${restore ? "window.__opener.focus();" : ""} }
  document.querySelectorAll("[data-peek-open]").forEach((b) => (b.onclick = () => open(b)));
  document.addEventListener("keydown", (e) => e.key === "Escape" && document.querySelector("[data-block=ChildPeek]") && close());`;
const peekPage = (restore: boolean) =>
  `<!doctype html><html><body><main><h1>Proof</h1><div data-ux="action"><a href="/__proof/other">Main action</a></div>
   <button data-peek-open="1">1 Alba Ant</button><button data-peek-open="2">2 Bea Badger</button><div id="slot"></div>
   <nav><a data-ux="next" href="/__proof/other">Next step</a></nav></main><script>${PEEK_JS(restore)}</script></body></html>`;
const filterPage = `<!doctype html><html><body><main><h1>Proof</h1><form method="get"><label>Class <select name="cls"><option value="">All</option><option value="a">A</option></select></label>
  <label>Search by name or Sr. No. <input type="search" name="q"></label></form>
  <script>const q=new URLSearchParams(location.search);document.querySelector("select").value=q.get("cls")||"";document.querySelector("select").onchange=()=>document.querySelector("form").submit();
  if([...q.values()].some(Boolean)){const u=document.createElement("ul");u.setAttribute("data-active-filters","");
  for(const [k,v] of q){if(!v)continue;u.innerHTML+='<li><a aria-label="Remove filter '+k+'" href="'+location.pathname+'">'+k+' ×</a></li>';}
  u.innerHTML+='<li><a href="'+location.pathname+'">Clear</a></li>';document.querySelector("main").append(u);}</script></main></body></html>`;

async function serve(page: Page, body: string, path = "/__proof/page") {
  await page.route("**/__proof/**", (r) => r.fulfill({ contentType: "text/html", body }));
  await page.goto(`${ORIGIN}${path}`);
}
const screen = (elements: Element[]): Screen => ({ id: "proof", route: "/__proof/page", group: "Children", who: "both", title: "Proof", elements });
const ctx = (inv: Inventory) => ({ inv, role: "educator" as const, width: 1440, allow, names: [] as string[], address: "/__proof/page" });

test("a peek is every child's open button, opens in place with the Sr. No. in the address, and closes on Escape with focus back", async ({ page }) => {
  const inv = mini();
  await serve(page, peekPage(true));
  const s = screen([{ t: "link", label: "Main action", href: "/__proof/other" }, { t: "peek", label: "each child" }, { t: "button", label: "peek: Close", effect: "closes ChildPeek; focus returns to the child that opened it", when: "peek" }, { t: "link", label: "peek: Open the child", href: "/__proof/child", when: "peek" }]);
  expect(await completeness(page, s, ctx(inv))).toEqual([]);
  await serve(page, peekPage(true));
  expect(await completeness(page, s, ctx(inv), "peek")).toEqual([]);
  await serve(page, peekPage(true));
  expect(await drive(page, s, s.elements[1], ctx(inv), new Map())).toEqual([]);
  await serve(page, peekPage(true));
  expect(await drive(page, s, s.elements[2], ctx(inv), new Map())).toEqual([]);
});

test("a peek that does not give focus back fails, naming it", async ({ page }) => {
  const inv = mini();
  await serve(page, peekPage(false));
  const s = screen([{ t: "peek", label: "each child" }]);
  expect((await drive(page, s, s.elements[0], ctx(inv), new Map())).join("\n")).toContain("focus did not return");
});

test("a filter writes itself into the address and survives a reload; × and Clear do what they say", async ({ page }) => {
  const inv = mini();
  const s = screen([
    { t: "filter", label: "class" },
    { t: "filter", label: "search by name or Sr. No." },
    { t: "button", label: "× on a filter chip", text: "Remove filter", effect: "removes that filter from the address", when: "filtered" },
    { t: "button", label: "Clear", effect: "removes every filter and the search", when: "filtered" },
  ]);
  for (const e of s.elements.slice(0, 2)) {
    await serve(page, filterPage);
    expect(await drive(page, s, e, ctx(inv), new Map()), e.label).toEqual([]);
  }
  for (const e of s.elements.slice(2)) {
    await serve(page, filterPage);
    expect(await drive(page, s, e, ctx(inv), new Map()), e.label).toEqual([]);
  }
  await serve(page, filterPage);
  expect(await completeness(page, s, ctx(inv), "filtered")).toEqual([]);
});

test("the frame's own links are not extra, and a control to a screen not built is neither required nor driven", async ({ page }) => {
  const inv = mini();
  await serve(page, peekPage(true));
  const s = screen([{ t: "link", label: "Main action", href: "/__proof/other" }, { t: "peek", label: "each child" }, { t: "link", label: "rail: Notes", to: "notes" }]);
  expect(await completeness(page, s, ctx(inv))).toEqual([]); // Next step is the frame's; Notes is not built, so it is not missing
  expect(await drive(page, s, s.elements[2], ctx(inv), new Map())).toEqual([]);
});

test("a button whose effect the checker cannot drive still fails, so nothing passes unexercised", async ({ page }) => {
  const inv = mini();
  await serve(page, peekPage(true));
  const s = screen([{ t: "button", label: "Send it", effect: "writes a row" }]);
  expect((await drive(page, s, s.elements[0], ctx(inv), new Map())).join("\n")).toContain("not yet drivable");
});

test("an element for many controls takes them all, by its data attribute or by 'each', and is driven through the first", async ({ page }) => {
  const inv = mini();
  const body = `<!doctype html><html><body><main><h1>Proof</h1><a data-ux="action" href="/__proof/other">Main action</a>
    <a data-node href="/__proof/other">Counting, secure</a><a data-node href="/__proof/other">Sorting, practising</a>
    <details><summary>What it said</summary>words</details><details><summary>What it said</summary>more words</details></main></body></html>`;
  await serve(page, body);
  const s = screen([{ t: "link", label: "Main action", href: "/__proof/other" }, { t: "link", label: "each graph node", data: "data-node", to: "nowhere" }, { t: "fold", label: "details on each timeline entry", text: "What it said" }]);
  expect(await completeness(page, s, ctx(inv))).toEqual([]);
  s.elements.pop();
  expect((await completeness(page, s, ctx(inv))).join("\n")).toContain("extra control — “What it said”");
});

test("a control with a declared drive is pressed, and what a person sees after is held to what the element says", async ({ browser }) => {
  test.setTimeout(300_000); // five audits of a page, each signing in afresh
  const inv = mini();
  const button = inv.screens.find((x) => x.id === "feedback")!.elements.find((x) => x.t === "button")!;
  // pressing it with nothing typed leaves the person on the same page, asking for the field: a pass
  button.drive = { expect: { url: "^/feedback", text: ["report a problem"] } };
  expect(await audit(browser, inv, "feedback"), "a drive that holds").toEqual([]);
  // the same press, held to something that does not happen, fails and says which control and what was not shown
  button.drive = { expect: { text: ["a sentence the page never says"], gone: ["report a problem"] } };
  const problems = (await audit(browser, inv, "feedback")).join("\n");
  expect(problems).toContain("“Send” did not show “a sentence the page never says” afterwards");
  expect(problems).toContain("“Send” still shows “report a problem” afterwards");
  // a drive that names a fixture or a field that is not there is a problem named, never a pass
  button.drive = { fixture: "nothing-of-the-kind", expect: {} };
  expect((await audit(browser, inv, "feedback")).join("\n")).toContain("names the fixture “nothing-of-the-kind”");
  button.drive = { fill: { "No such field": "x" }, expect: {} };
  expect((await audit(browser, inv, "feedback")).join("\n")).toContain("no field “No such field”");
});

// ---- UI-5b: the keyboard check. It must still fail a control Tab cannot reach and a page that traps focus, however long the page is;
// and it must pass a long page whose controls look alike. The limit on Tab presses (60 + the number of controls) only ends a loop: a
// control counts as reached when Tab has focused it, and no number of extra presses can focus a control that Tab skips.
const longPage = (n: number, extra = "") =>
  `<!doctype html><html><body style="margin:0"><main><h1>Proof</h1><div data-ux="action"><a href="/__proof/other" style="outline:2px solid #000">Main action</a></div>
   ${Array.from({ length: n }, (_, i) => `<p style="margin:0 0 30px"><button type="button" style="outline:2px solid #000">Move</button> row ${i + 1}</p>`).join("")}${extra}</main></body></html>`;

test("a long page of like controls (twelve identical Move buttons and sixty more) is reached by Tab in full", async ({ page }) => {
  await serve(page, longPage(70));
  expect(await keyboard(page, screen([]))).toEqual([]);
});

test("a control Tab cannot reach still fails the keyboard check, on a short page and on a long one, saying how many were reached", async ({ page }) => {
  for (const n of [5, 70]) {
    await serve(page, longPage(n, `<button type="button" tabindex="-1" style="outline:2px solid #000">Hidden from the keyboard</button>`));
    const problems = (await keyboard(page, screen([]))).join("\n");
    expect(problems, `${n} controls and one Tab skips`).toContain(`Tab reached ${n + 1} of ${n + 2} controls in the main column`);
  }
});

test("a page that traps focus in three controls fails the keyboard check however many controls follow", async ({ page }) => {
  const trap = `<script>const t=[...document.querySelectorAll("button")].slice(0,3);document.addEventListener("keydown",(e)=>{if(e.key!=="Tab")return;e.preventDefault();const i=t.indexOf(document.activeElement);t[(i+1)%3].focus();});</script>`;
  await serve(page, longPage(70, trap));
  const problems = (await keyboard(page, screen([]))).join("\n");
  expect(problems).toMatch(/Tab reached \d+ of 71 controls in the main column/);
});

// ---- UI-5b: a link to the page one is on (the first class row can be the class already open) changes no address and is not waited on;
// a link that points elsewhere and goes nowhere is still a dead link.
test("a row link that points at the page already open is driven without waiting for an address that cannot change", async ({ page }) => {
  const inv = mini();
  const body = `<!doctype html><html><body><main><h1>Proof</h1><div data-ux="action"><a href="/__proof/other">Main action</a></div>
    <a data-row href="/__proof/page?class=1">Class one (open)</a><a data-row href="/__proof/page?class=2">Class two</a></main></body></html>`;
  await page.route("**/__proof/**", (r) => r.fulfill({ contentType: "text/html", body }));
  await page.goto(`${ORIGIN}/__proof/page?class=1`);
  const s = screen([{ t: "row", label: "each class row", data: "data-row" }]);
  expect(await drive(page, s, s.elements[0], { ...ctx(inv), address: "/__proof/page?class=1" }, new Map())).toEqual([]);
});

test("a link that points elsewhere and leads nowhere still fails, by never changing the address", async ({ page }) => {
  test.setTimeout(90_000);
  const inv = mini();
  const body = `<!doctype html><html><body><main><h1>Proof</h1><div data-ux="action"><a href="/__proof/other">Main action</a></div>
    <a data-row href="/__proof/elsewhere" onclick="event.preventDefault()">Goes nowhere</a></main></body></html>`;
  await page.route("**/__proof/**", (r) => r.fulfill({ contentType: "text/html", body }));
  await page.goto(`${ORIGIN}/__proof/page`);
  const s = screen([{ t: "row", label: "each class row", data: "data-row" }]);
  await expect(drive(page, s, s.elements[0], ctx(inv), new Map())).rejects.toThrow(/waitForURL|Timeout/i);
});

// ---- UI-5e: the "opens a form" driver. It proves the control opens a form in place with a labelled field and a visible, enabled submit
// control. It does not press the submit (what a submit writes is proved by the screen's own test, or by a declared `drive`), so it cannot
// tell a submit that does nothing from one that works; what it does refuse is a form with no way to send it, so a dead button drawn as a
// form cannot pass for a working one.
const formPage = (form: string) =>
  `<!doctype html><html><body><main><h1>Proof</h1><div data-ux="action"><a href="/__proof/other" style="outline:2px solid #000">Main action</a></div>
   <button id="b" type="button" aria-expanded="false">Add a person</button><div id="slot"></div></main>
   <script>const b=document.getElementById("b"),slot=document.getElementById("slot");let on=false;
   b.onclick=()=>{on=!on;b.setAttribute("aria-expanded",String(on));slot.innerHTML=on?${JSON.stringify(form)}:"";};</script></body></html>`;
const openForm = (inv: Inventory) => ({ s: screen([{ t: "button", label: "Add a person", effect: "opens a form: name; Save puts the person on the list" }]), c: ctx(inv) });

test("a button that opens a form with a labelled field and a visible, enabled submit passes, whatever the submit is called", async ({ page }) => {
  const inv = mini();
  await serve(page, formPage(`<form><label>Name <input name="n"></label><button type="submit">Add and send a link</button></form>`));
  const { s, c } = openForm(inv);
  expect(await drive(page, s, s.elements[0], c, new Map())).toEqual([]);
  // a button with no type is a submit too
  await serve(page, formPage(`<form><label>Name <input name="n"></label><button>Go</button></form>`));
  expect(await drive(page, s, s.elements[0], c, new Map())).toEqual([]);
});

test("a form with no way to send it fails: no button, a button that only looks like one, a disabled submit, a hidden submit", async ({ page }) => {
  const inv = mini();
  const { s, c } = openForm(inv);
  const cases: Record<string, string> = {
    "no button at all": `<form><label>Name <input name="n"></label></form>`,
    "a button that is not a submit": `<form><label>Name <input name="n"></label><button type="button">Add and send a link</button></form>`,
    "a disabled submit": `<form><label>Name <input name="n"></label><button type="submit" disabled>Add and send a link</button></form>`,
    "a hidden submit": `<form><label>Name <input name="n"></label><button type="submit" style="display:none">Add and send a link</button></form>`,
  };
  for (const [why, form] of Object.entries(cases)) {
    await serve(page, formPage(form));
    expect((await drive(page, s, s.elements[0], c, new Map())).join("\n"), why).toContain("opened no form with a field and a button that can send it");
  }
});

test("a button that opens no form, or a form whose field has no label, still fails", async ({ page }) => {
  const inv = mini();
  const { s, c } = openForm(inv);
  await serve(page, formPage(`<p>Nothing to fill in here</p>`));
  expect((await drive(page, s, s.elements[0], c, new Map())).join("\n")).toContain("opened no form with a field");
  await serve(page, formPage(`<form><input name="n"><button type="submit">Send</button></form>`));
  expect((await drive(page, s, s.elements[0], c, new Map())).join("\n")).toContain("has a field with no label");
});
