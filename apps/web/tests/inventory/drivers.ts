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
  const press = (await button.count()) ? button : link;
  if (!(await press.count())) return [at(`cannot be driven: nothing to press called “${name}”`)];
  const popup = page.waitForEvent("popup", { timeout: 4_000 }).catch(() => null);
  await press.click();
  const opened = await popup;
  if (opened) await opened.close();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);
  const text = await main.innerText();
  if (d.expect.url && !new RegExp(d.expect.url).test(new URL(page.url()).pathname + new URL(page.url()).search)) out.push(at(`ended at ${page.url()}, which does not match ${d.expect.url}`));
  for (const t of d.expect.text ?? []) if (!text.toLowerCase().includes(t.toLowerCase())) out.push(at(`did not show “${t}” afterwards`));
  for (const t of d.expect.gone ?? []) if (text.toLowerCase().includes(t.toLowerCase())) out.push(at(`still shows “${t}” afterwards`));
  if (d.expect.check) {
    const check = CHECKS[d.expect.check];
    if (!check) out.push(at(`names the check “${d.expect.check}”, which tests/inventory-fixtures.ts does not have`));
    else out.push(...(await check()).map((p) => at(p)));
  }
  return out;
}
