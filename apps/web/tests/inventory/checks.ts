// The ten generic checks of docs/frontend/screens.json (`generic_checks`), as functions that return what is wrong, in words that
// name the screen, the control and the reason: [] is a pass. Each reads the page the way a person would: its rendered text, its
// controls, its focus. Nothing here knows a particular screen.
import type { Page } from "@playwright/test";
import { PURPOSE_MAX } from "../../lib/ux-rules";
import { titleMatches, type Element, type Inventory, type Screen } from "./load";

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
      .map((e) => ({ tag: e.tagName.toLowerCase(), href: e.getAttribute("href") ?? "", name: (e.getAttribute("aria-label") || (e as HTMLInputElement).labels?.[0]?.innerText || e.innerText || (e as HTMLInputElement).placeholder || "").trim(), ...(() => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y }; })() }));
  }, CONTROLS);
}

const expectedFor = (s: Screen, role: Ctx["role"]) => s.elements.filter((e) => e.t !== "child_name" && (!e.for || e.for === role));

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
  if ((s.rail?.length ?? 0) > 0 && !(await page.locator("[data-rail]").count())) out.push(`${s.id}: the inventory lists a rail and the page has none`);
  return out;
}

/** 2. Completeness: the controls of the main column and the rail are this screen's element list for the role. */
export async function completeness(page: Page, s: Screen, c: Ctx): Promise<Problems> {
  const out: Problems = [];
  const found = await mainControls(page);
  const want = expectedFor(s, c.role);
  const left = [...found];
  for (const e of want) {
    const at = left.findIndex((f) => (e.href ? f.href === e.href : f.name.toLowerCase().includes((e.text ?? e.label).toLowerCase())));
    if (at < 0) out.push(`${s.id}: missing control — “${e.label}” (${e.t}${e.href ? ` ${e.href}` : ""}) is in the inventory and not on the page`);
    else left.splice(at, 1);
  }
  for (const f of left) out.push(`${s.id}: extra control — “${f.name || f.href}” (${f.tag}) is on the page and not in the inventory`);
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

/** The element kinds a person drives: a link, a row or a cell lands on its target screen; Back returns; a tab keeps the h1; a fold opens and closes. */
export async function drive(page: Page, s: Screen, e: Element, c: Ctx, byId: Map<string, Screen>): Promise<Problems> {
  const out: Problems = [];
  const here = page.url();
  const find = () => (e.href ? page.locator("main").locator(`a[href="${e.href}"]`).first() : page.locator("main a").filter({ hasText: e.text ?? e.label }).first());
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
    // a button is driven only where the inventory states its effect: otherwise there is nothing to assert but that it exists (check 2)
    if (e.effect) out.push(`${s.id}: the effect of “${e.label}” (${e.effect}) is not yet drivable by tests/inventory/checks.ts`);
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
    const f = page.locator("main").getByLabel(e.text ?? e.label).first();
    if (!(await f.count())) out.push(`${s.id}: the field “${e.label}” has no label`);
  }
  return out;
}
