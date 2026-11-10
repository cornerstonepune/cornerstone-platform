// What the inventory test needs that only the database holds: the two people it signs in as, and the concrete address of a screen
// whose route has a [param]. Built from the test's own rows (a class of the test's own, its children made from tests/fake-names.ts),
// so it proves the same thing on a database built from the repository as on a copy of live.
import { createHmac } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import type { Sql } from "postgres";
import { SIGNED_IN } from "../playwright.config";
import { aClass, aPerson, aTaughtClass, personAsStored } from "./rows";
import { curriculumRows, gate, offers } from "./m1-13-rows";
import { FAKE_CHILDREN } from "./fake-names";

export const SECTION = "U70A";
export const EDUCATOR = { email: "u70-educator@cornerstone.test", name: "Inventory Educator", role: "educator", classes: [SECTION], subjects: ["NUM"] };

export const OTHER = "U70B";
export type Rows = { questionKey: string; section: string; classId: string; children: Record<string, string>; rolls: Record<string, string>; other: Record<string, string>; otherNames: string[] };

/** The educator (one class, one subject) and a class of fake children with Sr. Nos 1..n. Made once; a second run finds them. */
export async function inventoryRows(sql: Sql): Promise<Rows> {
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  const names = FAKE_CHILDREN.slice(0, 6);
  const children = await aClass(sql, SECTION, "K2", [...names]);
  const [cls] = await sql<{ id: string }[]>`select id from school_class where label = ${SECTION} order by created_at limit 1`;
  const rolls = Object.fromEntries(names.map((n, i) => [n, String(i + 1)]));
  // a class the educator does not hold, with Sr. Nos 7 and 8 that the educator's class has no child for
  const otherNames = FAKE_CHILDREN.slice(10, 18) as unknown as string[];
  const other = await aClass(sql, OTHER, "K2", otherNames);
  // Setup content (UI-11): a class that is taught something, so the bank lists questions; the K2 curriculum pages open (the gate's
  // "reviewer" mode) with two offered skills waiting; a question to open
  await aTaughtClass(sql);
  await gate(sql, "reviewer");
  const { skills } = await curriculumRows(sql);
  await offers(sql, skills);
  const [q] = await sql<{ item_key: string }[]>`
    select i.item_key from item i join question_type t on t.fmt = i.fmt and t.own_words
    where i.source = 'generated' and i.status = 'active' order by i.created_at, i.item_key limit 1`;
  return { questionKey: q?.item_key ?? "", section: SECTION, classId: cls?.id ?? "", children, rolls, other, otherNames };
}

/** A new browser context signed in as the educator or the coordinator, the way the site signs anyone in. */
export async function signedInAs(browser: Browser, who: "educator" | "coordinator", viewport: { width: number; height: number }, colorScheme: "light" | "dark" = "light"): Promise<BrowserContext> {
  const base = { baseURL: "http://localhost:3100", viewport, colorScheme };
  if (who === "coordinator") return browser.newContext({ ...base, storageState: SIGNED_IN });
  const body = `${Buffer.from(EDUCATOR.email).toString("base64url")}.${Date.now() + 3_600_000}`;
  const mac = createHmac("sha256", process.env.E2E_AUTH_SECRET!).update(body).digest("hex");
  const context = await browser.newContext(base);
  await context.addCookies([{ name: "cs_staff", value: `${body}.${mac}`, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  return context;
}

/** The concrete address of a screen: its route with each [param] filled from the rows. A param with no fixture is a failure, so a new
 *  slice adds its own here before its screens can be covered. */
export function addressOf(route: string, rows: Rows, over: Record<string, string> = {}): string {
  const first = Object.values(rows.children)[0] ?? "";
  const given: Record<string, string> = { key: rows.questionKey, class: rows.classId, section: rows.section, roll: "1", id: first, ...over };
  return route.replace(/\[(\w+)\]/g, (_, k: string) => {
    if (!(k in given)) throw new Error(`tests/inventory/fixtures.ts has no fixture for [${k}] of ${route}: add one built from the test's own rows`);
    return encodeURIComponent(given[k]);
  });
}

/** The coordinator's own copy of createHmac is not needed: the signed-in file holds the cookie. */
export const sessionFor = (email: string, secret = process.env.E2E_AUTH_SECRET!) => {
  const body = `${Buffer.from(email).toString("base64url")}.${Date.now() + 3_600_000}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
};

/** The rows a stateful control needs in place before it is pressed, by the name an element's `drive.fixture` gives (tests/inventory/drivers.ts). */
export const FIXTURES: Record<string, () => Promise<void>> = {};
/** What a control must have done to the rows, by the name an element's `drive.expect.check` gives: the problems, [] when it holds. */
export const CHECKS: Record<string, () => Promise<string[]>> = {};
