// A control that changes something is driven the way a person would, as its element declares in screens.json (`drive`): put the
// rows it needs in place, fill the fields, press it, and see what the element says a person sees. [] when it all holds; a step that
// cannot be done is a problem named, never a pass. Nothing here knows a particular screen.
import type { Page } from "@playwright/test";
import { CHECKS, FIXTURES } from "../inventory-fixtures";
import type { Element, Screen } from "./load";

export async function drive(page: Page, s: Screen, e: Element, needle: string): Promise<string[]> {
  const d = e.drive;
  if (!d) return [];
  const out: string[] = [];
  const at = (why: string) => `${s.id}: “${e.label}” ${why}`;
  if (d.fixture) {
    const put = FIXTURES[d.fixture];
    if (!put) return [at(`names the fixture “${d.fixture}”, which tests/inventory-fixtures.ts does not have`)];
    await put();
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  const main = page.locator("main");
  for (const [label, value] of Object.entries(d.fill ?? {})) {
    const f = main.getByLabel(label, { exact: false }).first();
    if (!(await f.count())) return [at(`cannot be driven: no field “${label}”`)];
    await f.fill(value);
  }
  const name = d.click ?? needle;
  const button = main.getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  const link = main.getByRole("link", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
  // the page streams its rows in: wait for the control to be drawn before saying it is not there
  await button.or(link).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const press = (await button.count()) ? button : link;
  if (!(await press.count())) return [at(`cannot be driven: nothing to press called “${name}”`)];
  // a control that opens a new tab is held to opening it at its own address; the file behind that address (a pack of papers the engine
  // draws) is not what is under test, so the tab is given a stand-in and the engine is not asked to draw it for every press
  const href = d.expect.popup ? await press.getAttribute("href") : null;
  const target = href ? new URL(href, page.url()).href : null;
  const asked: string[] = [];
  const stand = (r: import("@playwright/test").Route) => {
    asked.push(r.request().url());
    return r.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF" });
  };
  if (target) await page.context().route(target, stand);
  const popup = page.waitForEvent("popup", { timeout: 4_000 }).catch(() => null);
  await press.click();
  const opened = await popup;
  if (d.expect.popup && !opened) out.push(at("did not open a new tab"));
  if (opened) await opened.close();
  if (target) await page.context().unroute(target, stand);
  if (target && opened && !asked.length) out.push(at(`opened a new tab, but not at its own address ${target}`));
  await page.waitForLoadState("domcontentloaded");
  // what a person sees afterwards is waited for, not guessed at with a pause: the action runs on the server and the page is drawn again
  const holds = async () => {
    const now = (await main.innerText().catch(() => "")).toLowerCase();
    const at_ = new URL(page.url()).pathname + new URL(page.url()).search;
    return (!d.expect.url || new RegExp(d.expect.url).test(at_)) && (d.expect.text ?? []).every((t) => now.includes(t.toLowerCase())) && (d.expect.gone ?? []).every((t) => !now.includes(t.toLowerCase()));
  };
  for (let i = 0; i < 40 && !(await holds()); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(250);
  const text = await main.innerText();
  if (d.expect.url && !new RegExp(d.expect.url).test(new URL(page.url()).pathname + new URL(page.url()).search)) out.push(at(`ended at ${page.url()}, which does not match ${d.expect.url}`));
  for (const t of d.expect.text ?? []) if (!text.toLowerCase().includes(t.toLowerCase())) out.push(at(`did not show “${t}” afterwards`));
  for (const t of d.expect.gone ?? []) if (text.toLowerCase().includes(t.toLowerCase())) out.push(at(`still shows “${t}” afterwards`));
  if (d.expect.check) {
    const check = CHECKS[d.expect.check];
    if (!check) out.push(at(`names the check “${d.expect.check}”, which tests/inventory-fixtures.ts does not have`));
    else out.push(...(await check()).map((p) => at(p)));
  }
  if (d.after) {
    const back = FIXTURES[d.after];
    if (!back) out.push(at(`names the fixture “${d.after}” to put the rows back, which tests/inventory-fixtures.ts does not have`));
    else {
      await back();
      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }
  return out;
}
