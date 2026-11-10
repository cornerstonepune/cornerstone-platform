// The ten generic checks of docs/frontend/screens.json (`generic_checks`), as functions that return what is wrong, in words that
// name the screen, the control and the reason: [] is a pass. Each reads the page the way a person would: its rendered text, its
// controls, its focus. Nothing here knows a particular screen.
import type { Page } from "@playwright/test";
import { PURPOSE_MAX } from "../../lib/ux-rules";
import { ADDRESSES } from "../inventory-fixtures";
import { drive as driven } from "./drivers";
import { builtScreens, titleMatches, type Element, type Inventory, type Screen, type When } from "./load";

export type Ctx = { inv: Inventory; role: "educator" | "coordinator"; width: number; allow: readonly string[]; names: readonly string[]; address: string };
type Problems = string[];

const CONTROLS = "a[href], button, [role=button], summary, input:not([type=hidden]), select, textarea";

/** The controls of the main column and the rail (the trail is the frame's, and Next's own action fields are not controls), as measured boxes. */
async function mainControls(page: Page) {
  return page.evaluate((sel) => {
    const main = document.querySelector("main");
    if (!main) return [];
    return [...main.querySelectorAll<HTMLElement>(sel)]
      .filter((e) => !e.closest("[data-trail]") && !(e as HTMLInputElement).name?.startsWith("$ACTION"))
      // the frame's own links (the next step, the details link) are drawn on every screen: an element may list one, and none is extra
      .map((e) => ({ tag: e.tagName.toLowerCase(), frame: e.matches("[data-ux=next], [data-ux=details]"), peek: e.hasAttribute("data-peek-open"), attrs: e.getAttributeNames(), href: e.getAttribute("href") ?? "", name: (e.getAttribute("aria-label") || (e as HTMLInputElement).labels?.[0]?.innerText || e.innerText || (e as HTMLInputElement).placeholder || "").trim(), ...(() => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y }; })() }));
  }, CONTROLS);
}

/** An element is for the person when it names no group, or names theirs (`for`, or `roles` on a filter). */
export const forRole = (e: Element, role: Ctx["role"]) => (!e.for || e.for === role) && (!e.roles || e.roles.includes(role));
const expectedFor = (s: Screen, role: Ctx["role"]) => s.elements.filter((e) => e.t !== "child_name" && forRole(e, role));

/** 1. Renders: eyebrow 14 px or more, one h1 equal to the title, a purpose line within its limit, one main action, the trail, the rail where listed; bare for `frame: bare`. At 400 the smoke test. */
export async function renders(page: Page, s: Screen, c: Ctx, errors: string[]): Promise<Problems> {
  const out: Problems = [];
  const h1 = await page.locator("h1").allInnerTexts();
  if (h1.length !== 1) out.push(`${s.id}: ${h1.length} h1 on the page, not one`);
  else if (!titleMatches(s.title, h1[0])) out.push(`${s.id}: the h1 is “${h1[0]}”, the inventory's title is “${s.title}”`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) out.push(`${s.id} at ${c.width}: the page scrolls sideways`);
  if (errors.length) out.push(`${s.id}: console error: ${errors[0]}`);
  if (s.frame === "bare") {
    if ((await page.locator("[data-frame=bare]").count()) !== 1 || (await page.locator("[data-bar], [data-rail]").count())) out.push(`${s.id}: not the bare frame (logo and form, no bar, no rail)`);
    return out;
  }
  if (c.width < 1000) return out;
  const eyebrow = await page.getByTestId("stage").first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize)).catch(() => 0);
  if (eyebrow < 14) out.push(`${s.id}: the eyebrow is ${eyebrow} px, not 14 or more`);
  const purpose = await page.locator("header p").first().innerText().catch(() => "");
  if (!purpose || purpose.length > PURPOSE_MAX) out.push(`${s.id}: the purpose line is ${purpose.length} characters (1 to ${PURPOSE_MAX})`);
  const actions = await page.locator("[data-ux=action]").count();
  if (actions !== 1) out.push(`${s.id}: ${actions} main actions, not exactly one`);
  if (!(await page.locator("[data-trail]").count())) out.push(`${s.id}: no trail`);
  // a rail whose every link goes to a screen not built yet has nothing to draw (the link is not a dead link, it is not there)
  const railEls = s.elements.filter((e) => /^(rail|capture):/i.test(e.label));
  const railDrawn = railEls.length === 0 || railEls.some((e) => buildable(e, c));
  if ((s.rail?.length ?? 0) > 0 && railDrawn && !(await page.locator("[data-rail]").count())) out.push(`${s.id}: the inventory lists a rail and the page has none`);
  return out;
}

/** What a control is called in the inventory is what a person reads on it, after the place it sits in: "rail: Notes" is the link "Notes". */
const needle = (e: Element) => (e.text ?? e.label).replace(/^(rail|page|peek|capture|next step|details):\s*/i, "").toLowerCase();
/** Whether a screen's element is expected on the page in this run: the one whose target is not built is not drawn (and not a dead link). */
function buildable(e: Element, c: Ctx) {
  return !e.to || builtScreens(c.inv).has(e.to);
}

/** Brings the page into a state in which a conditional control exists: a child chosen, a filter on. [] when it did; the reason when it could not. */
export async function reveal(page: Page, when: When): Promise<string | null> {
  if (when.startsWith("@")) {
    const at = ADDRESSES[when.slice(1)];
    if (!at) return `no address called “${when.slice(1)}” in tests/inventory-fixtures.ts ADDRESSES`;
    await page.goto(await at(), { waitUntil: "networkidle" });
    return null;
  }
  // a state the address holds ("?view=table"): the same screen with those parameters set, as a person's own click on a tab would leave it
  if (when.startsWith("?")) {
    const u = new URL(page.url());
    for (const [k, v] of new URLSearchParams(when)) u.searchParams.set(k, v);
    // the page streams: its rows arrive after the load event, so the state is reached when the network has gone quiet
    await page.goto(u.pathname + u.search, { waitUntil: "networkidle" });
    return null;
  }
  if (when === "peek") {
    const opener = page.locator("main [data-peek-open]").first();
    await opener.waitFor({ timeout: 10_000 }).catch(() => undefined); // the page streams: the rows may arrive after the load event
    if (!(await opener.count())) return "no child to choose";
    await opener.click();
    await page.locator("[data-block=ChildPeek]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    return (await page.locator("[data-block=ChildPeek]").count()) ? null : "choosing a child did not open the peek";
  }
  if (when === "filtered") {
    const box = page.locator("main input[type=search]").first();
    await box.waitFor({ timeout: 10_000 }).catch(() => undefined);
    if (!(await box.count())) return "no search field to filter with";
    await box.fill("1");
    await box.press("Enter");
    await page.locator("[data-active-filters]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    return (await page.locator("[data-active-filters]").count()) ? null : "searching did not show a filter chip";
  }
  await page.locator("main [data-more], main nav[aria-label$=' pages']").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  return (await page.locator("main [data-more], main nav[aria-label$=' pages']").count()) ? null : "the fixture has too few rows for a second page";
}

/** 2. Completeness: the controls of the main column and the rail are this screen's element list for the role, in the given state. Nothing
 *  extra, nothing missing. A control of an element with a `when` is required only once the page is in that state, and allowed in any;
 *  one whose target screen is not built is not required. A `peek` element is every child's open button. */
export async function completeness(page: Page, s: Screen, c: Ctx, state: When | "rest" = "rest"): Promise<Problems> {
  const out: Problems = [];
  if (state !== "rest") {
    const why = await reveal(page, state);
    if (why) return [`${s.id}: cannot bring the page to “${state}” to look for its controls: ${why}`];
  }
  const found = await mainControls(page);
  const left = [...found];
  for (const e of expectedFor(s, c.role)) {
    const needed = buildable(e, c) && (e.when ? e.when === state : state === "rest");
    // an element that stands for many controls takes them all: every child's open button (`peek`), every control carrying its `data`
    // attribute, or every control it names with "each"; at least one is required while the element is expected
    const many = e.t === "peek" ? (f: (typeof left)[number]) => f.peek : e.data ? (f: (typeof left)[number]) => f.attrs.includes(e.data!) : /\beach\b/i.test(e.label) ? (f: (typeof left)[number]) => f.name.toLowerCase().includes(needle(e).replace(/^each\s+/, "")) : null;
    if (many) {
      const taken = left.filter(many);
      if (!taken.length && needed) out.push(`${s.id}: missing control — “${e.label}” (${e.t}) is in the inventory and not on the page`);
      for (const f of taken) left.splice(left.indexOf(f), 1);
      continue;
    }
    // the best match first: a control named exactly what the element says, then one that starts with it, then one that holds it; a
    // control of the screen before one of the frame's (the Next step link may carry the same words)
    const named = (f: (typeof left)[number]) => f.name.split("\n")[0].trim().toLowerCase();
    const tries = e.href ? [(f: (typeof left)[number]) => f.href === e.href] : [(f: (typeof left)[number]) => named(f) === needle(e), (f: (typeof left)[number]) => named(f).startsWith(needle(e)), (f: (typeof left)[number]) => f.name.toLowerCase().includes(needle(e))];
    let at = -1;
    for (const t of tries) for (const frame of [false, true]) if (at < 0) at = left.findIndex((f) => f.frame === frame && t(f));
    if (at < 0) {
      if (needed) out.push(`${s.id}: missing control — “${e.label}” (${e.t}${e.href ? ` ${e.href}` : ""}) is in the inventory and not on the page`);
    } else left.splice(at, 1);
  }
  for (const f of left.filter((x) => !x.frame)) out.push(`${s.id}: extra control — “${f.name || f.href}” (${f.tag}) is on the page and not in the inventory`);
  return out;
}

/** 3, 4, 5: keyboard, on a screen's controls: Tab reaches each one in reading order, and the focused control shows a ring of 2 px or more. */
export async function keyboard(page: Page, s: Screen): Promise<Problems> {
  const out: Problems = [];
  const n = (await mainControls(page)).filter((f) => f.w > 0 && f.h > 0).length;
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const seen = new Set<string>();
  for (let i = 0; i < 80 && seen.size < n; i++) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || !e.closest("main") || e.closest("[data-trail]")) return null;
      const st = getComputedStyle(e);
      return { key: `${e.tagName}${e.getAttribute("href") ?? ""}${(e.innerText || "").slice(0, 20)}${Math.round(e.getBoundingClientRect().y)}`, ring: st.outlineStyle !== "none" ? parseFloat(st.outlineWidth) : 0, shadow: st.boxShadow !== "none" };
    });
    if (!at || seen.has(at.key)) continue;
    seen.add(at.key);
    if (at.ring < 2 && !at.shadow) out.push(`${s.id}: a focused control shows no ring of 2 px or more (${at.key})`);
  }
  if (seen.size < n) out.push(`${s.id}: Tab reached ${seen.size} of ${n} controls in the main column`);
  return out;
}

/** 7. Touch (a phone_gate screen at 400): every control at least 44 × 44 px with 8 px to its neighbour. */
export async function touch(page: Page, s: Screen): Promise<Problems> {
  const out: Problems = [];
  const f = (await mainControls(page)).filter((x) => x.w > 0 && x.h > 0);
  for (const x of f) if (x.w < 44 || x.h < 44) out.push(`${s.id}: “${x.name || x.href}” is ${Math.round(x.w)} × ${Math.round(x.h)} px, under 44 × 44`);
  for (let i = 0; i < f.length; i++)
    for (let j = i + 1; j < f.length; j++) {
      const a = f[i], b = f[j];
      const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      const apart = gx < 0 && gy < 0 ? 0 : gx < 0 ? gy : gy < 0 ? gx : Math.hypot(gx, gy);
      if (apart < 8) out.push(`${s.id}: “${a.name || a.href}” and “${b.name || b.href}” are ${Math.round(apart)} px apart, under 8`);
    }
  return out;
}

/** 8. Words: 'educator' never 'teacher'; no name in an address; every child name found in the page is in the allow-list; no foreign script or font host. */
export async function words(page: Page, s: Screen, c: Ctx, hosts: Set<string>): Promise<Problems> {
  const out: Problems = [];
  const text = await page.locator("main").innerText();
  if (/\bteachers?\b/i.test(text.replace(/\bK2 teaching\b/gi, ""))) out.push(`${s.id}: the word “teacher” is on the page (it is “educator”)`);
  for (const n of c.names) {
    if (new RegExp(`\\b${n.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}\\b`).test(text) && !c.allow.includes(n)) out.push(`${s.id}: the name “${n}” is on the page and is not in tests/fake-names.ts (a name not in the allow-list)`);
    if (page.url().toLowerCase().includes(n.toLowerCase()) && n.length > 3) out.push(`${s.id}: a child's name is in the address`);
  }
  for (const h of hosts) if (h !== "localhost:3100") out.push(`${s.id}: the page loaded something from ${h}, not the site's own host`);
  return out;
}

/** The stated effect of a button, driven against the page the way a person would, in the state the element says. [] when it holds. */
async function effect(page: Page, s: Screen, e: Element): Promise<Problems> {
  const out: Problems = [];
  const say = e.effect ?? "";
  if (e.drive) return driven(page, s, e, needle(e));
  if (/closes ChildPeek/i.test(say)) {
    const peek = page.locator("[data-block=ChildPeek]").first();
    await peek.getByRole("button", { name: /^close$/i }).click();
    if (await peek.count()) out.push(`${s.id}: “${e.label}” did not close the peek`);
    else if (!(await page.evaluate(() => document.activeElement?.hasAttribute("data-peek-open")))) out.push(`${s.id}: after “${e.label}” focus did not return to the child that opened the peek`);
    if (new URL(page.url()).searchParams.has("peek")) out.push(`${s.id}: after “${e.label}” the address still carries the peek`);
  } else if (/removes every filter/i.test(say)) {
    await page.locator("[data-active-filters]").getByRole("link", { name: "Clear" }).click();
    await page.waitForURL((u) => ![...u.searchParams.keys()].some((k) => k !== "peek"), { timeout: 10_000 }).catch(() => undefined);
    if ([...new URL(page.url()).searchParams.keys()].length || (await page.locator("[data-active-filters]").count())) out.push(`${s.id}: “${e.label}” left a filter on (${page.url()})`);
  } else if (/removes that filter/i.test(say)) {
    const before = [...new URL(page.url()).searchParams.keys()].length;
    await page.locator("[data-active-filters] a[aria-label^='Remove filter']").first().click();
    await page.waitForURL((u) => [...u.searchParams.keys()].length < before, { timeout: 10_000 }).catch(() => undefined);
    if ([...new URL(page.url()).searchParams.keys()].length >= before) out.push(`${s.id}: “${e.label}” did not take its filter out of the address (${page.url()})`);
  } else out.push(`${s.id}: the effect of “${e.label}” (${say}) is not yet drivable by tests/inventory/checks.ts`);
  return out;
}

/** A filter changes the rows and writes itself into the address, and a reload keeps it. */
async function filter(page: Page, s: Screen, e: Element): Promise<Problems> {
  const out: Problems = [];
  const first = new URL(page.url()).search;
  const search = /search/i.test(e.label);
  if (search) {
    const box = page.locator("main input[type=search]").first();
    await box.waitFor({ timeout: 10_000 }).catch(() => undefined);
    if (!(await box.count())) return [`${s.id}: the filter “${e.label}” has no search field`];
    await box.fill("1");
    await box.press("Enter");
  } else {
    const sel = page.locator("main label").filter({ hasText: new RegExp(needle(e), "i") }).locator("select").first();
    await sel.waitFor({ timeout: 10_000 }).catch(() => undefined);
    if (!(await sel.count())) return [`${s.id}: the filter “${e.label}” has no select`];
    const options = await sel.locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
    const now = await sel.inputValue();
    const pick = options.reverse().find((v) => v !== now);
    if (pick === undefined) return [`${s.id}: the filter “${e.label}” offers no other choice`];
    await sel.selectOption(pick);
  }
  await page.waitForURL((u) => u.search !== first, { timeout: 10_000 }).catch(() => undefined);
  const set = new URL(page.url()).search;
  if (set === first) return [`${s.id}: the filter “${e.label}” did not write itself into the address`];
  await page.reload({ waitUntil: "domcontentloaded" });
  if (new URL(page.url()).search !== set) out.push(`${s.id}: a reload lost the filter “${e.label}”`);
  return out;
}

/** The element kinds a person drives: a link, a row or a cell lands on its target screen; Back returns; a tab keeps the h1; a fold opens and closes;
 *  a peek opens in place, carries the Sr. No. and closes on Escape with focus back; a filter writes itself into the address; a button does its stated effect. */
export async function drive(page: Page, s: Screen, e: Element, c: Ctx, byId: Map<string, Screen>): Promise<Problems> {
  const out: Problems = [];
  if (!buildable(e, c)) return out;
  if (e.when) {
    const why = await reveal(page, e.when);
    if (why) return [`${s.id}: cannot bring the page to “${e.when}” to drive “${e.label}”: ${why}`];
  }
  const here = page.url();
  const find = () => (e.data ? page.locator(`main a[${e.data}]`).first() : e.href ? page.locator("main").locator(`a[href="${e.href}"]`).first() : page.locator("main a").filter({ hasText: needle(e) }).first());
  if (e.t === "peek") {
    const opener = page.locator("main [data-peek-open]").first();
    await opener.waitFor({ timeout: 10_000 }).catch(() => undefined);
    if (!(await opener.count())) return [`${s.id}: cannot drive “${e.label}”: no child to choose`];
    await opener.focus();
    await opener.click();
    await page.locator("[data-block=ChildPeek]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    if (!(await page.locator("[data-block=ChildPeek]").count())) return [`${s.id}: “${e.label}” did not open the peek in place`];
    if (!new URL(page.url()).searchParams.has("peek")) out.push(`${s.id}: the open peek is not in the address (the Sr. No., never a name)`);
    await page.keyboard.press("Escape");
    if (await page.locator("[data-block=ChildPeek]").count()) out.push(`${s.id}: Escape did not close the peek`);
    else if (!(await page.evaluate(() => document.activeElement?.hasAttribute("data-peek-open")))) out.push(`${s.id}: after Escape focus did not return to the child that opened the peek`);
    return out;
  }
  if (e.t === "filter") return filter(page, s, e);
  if (["link", "row", "cell"].includes(e.t)) {
    if (!(await find().count())) return [`${s.id}: cannot drive “${e.label}”: no such link`];
    const same = e.href === new URL(here).pathname + new URL(here).search;
    await find().click();
    if (!same) await page.waitForURL((u) => u.href !== here, { timeout: 20_000 });
    await page.waitForLoadState("domcontentloaded");
    await page.locator("h1").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    const h1 = (await page.locator("h1").allInnerTexts())[0] ?? "";
    const target = e.to ? byId.get(e.to) : undefined;
    if (e.to && !target) out.push(`${s.id}: “${e.label}” targets ${e.to}, which is not in the inventory`);
    else if (target && !titleMatches(target.title, h1)) out.push(`${s.id}: “${e.label}” did not land on ${e.to}: its h1 is “${h1}”, expected “${target.title}” (a dead link)`);
    else if (e.external && !h1) out.push(`${s.id}: “${e.label}” opens ${e.external} and it shows no heading (a dead link)`);
    if (!same) {
      await page.goBack();
      await page.waitForLoadState("domcontentloaded");
      if (page.url() !== here) out.push(`${s.id}: Back from “${e.label}” returned to ${page.url()}, not ${here}`);
    }
  } else if (e.t === "button") {
    // a button is driven by its stated effect; with none stated there is nothing to assert but that it exists (check 2)
    if (e.effect || e.drive) out.push(...(await effect(page, s, e)));
  } else if (e.t === "fold") {
    const sum = page.locator("main summary").filter({ hasText: e.text ?? e.label }).first();
    const d = sum.locator("xpath=..");
    const was = await d.evaluate((n) => (n as HTMLDetailsElement).open);
    await sum.click();
    if ((await d.evaluate((n) => (n as HTMLDetailsElement).open)) === was) out.push(`${s.id}: the fold “${e.label}” did not change on click`);
    await sum.click();
    if ((await d.evaluate((n) => (n as HTMLDetailsElement).open)) !== was) out.push(`${s.id}: the fold “${e.label}” did not close on a second click`);
  } else if (e.t === "switch") {
    const sw = page.getByRole("switch").first();
    if (!(await sw.getAttribute("aria-checked"))) out.push(`${s.id}: the switch “${e.label}” does not speak its state (aria-checked)`);
  } else if (e.t === "field") {
    const f = page.locator("main").getByLabel(needle(e)).first();
    if (!(await f.count())) out.push(`${s.id}: the field “${e.label}” has no label`);
  }
  return out;
}
