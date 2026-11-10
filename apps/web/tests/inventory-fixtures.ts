// What the inventory test needs that only the database holds: the two people it signs in as, and the concrete address of a screen
// whose route has a [param]. Built from the test's own rows (a class of the test's own, its children made from tests/fake-names.ts),
// so it proves the same thing on a database built from the repository as on a copy of live.
import { createHmac } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import postgres, { type Sql } from "postgres";
import { issuesMade } from "./github-server";
import { SIGNED_IN } from "../playwright.config";
import { aClass, aPerson, personAsStored } from "./rows";
import { FAKE_CHILDREN } from "./fake-names";

export const SECTION = "U70A";
export const EDUCATOR = { email: "u70-educator@cornerstone.test", name: "Inventory Educator", role: "educator", classes: [SECTION], subjects: ["NUM"] };

export const OTHER = "U70B";
export type Rows = { section: string; classId: string; children: Record<string, string>; rolls: Record<string, string>; other: Record<string, string>; otherNames: string[] };

/** The educator (one class, one subject) and a class of fake children with Sr. Nos 1..n. Made once; a second run finds them. */
export async function inventoryRows(sql: Sql): Promise<Rows> {
  if (!(await personAsStored(sql, EDUCATOR.email))) await aPerson(sql, EDUCATOR);
  // twelve: one assessment of the class then has more than ten copies, so a screen can show its second page of them
  const names = FAKE_CHILDREN.slice(0, 12);
  const children = await aClass(sql, SECTION, "K2", [...names]);
  const [cls] = await sql<{ id: string }[]>`select id from school_class where label = ${SECTION} order by created_at limit 1`;
  const rolls = Object.fromEntries(names.map((n, i) => [n, String(i + 1)]));
  // a class the educator does not hold, with Sr. Nos 13 and 14 that the educator's class has no child for
  const otherNames = FAKE_CHILDREN.slice(12, 26) as unknown as string[];
  const other = await aClass(sql, OTHER, "K2", otherNames);
  return { section: SECTION, classId: cls?.id ?? "", children, rolls, other, otherNames };
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
  const given: Record<string, string> = { class: rows.classId, section: rows.section, roll: "1", id: first, ...over };
  const path = route.replace(/\[(\w+)\]/g, (_, k: string) => {
    if (!(k in given)) throw new Error(`tests/inventory/fixtures.ts has no fixture for [${k}] of ${route}: add one built from the test's own rows`);
    return encodeURIComponent(given[k]);
  });
  // Classes and children opens one class below its table: the test's own, so the children are the fake ones above and not whatever other specs left in the first
  return route === "/setup/classes" ? `${path}?class=${rows.classId}` : path;
}

/** The coordinator's own copy of createHmac is not needed: the signed-in file holds the cookie. */
export const sessionFor = (email: string, secret = process.env.E2E_AUTH_SECRET!) => {
  const body = `${Buffer.from(email).toString("base64url")}.${Date.now() + 3_600_000}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
};

/** The rows a stateful control needs in place before it is pressed, by the name an element's `drive.fixture` gives (tests/inventory/drivers.ts). */
export const FIXTURES: Record<string, () => Promise<void>> = {};
/** What a control must have done to the rows, by the name an element's `drive.expect.check` gives: the problems, [] when it holds. */
export const CHECKS: Record<string, () => Promise<string[]>> = {
  // Report a problem, Send: each note the inventory sent is one staff_note row and one issue on the run's own GitHub, whose body holds no email
  feedback_note_sent: async () => {
    const mark = "Inventory check: the page reached the team";
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const wait = Date.now() + 20_000;
      let notes: { status: string }[] = [];
      do {
        notes = await sql<{ status: string }[]>`select status from staff_note where happened = ${mark}`;
        if (notes.length && notes.every((n) => n.status === "sent")) break;
        await new Promise((r) => setTimeout(r, 500));
      } while (Date.now() < wait);
      const issues = issuesMade().filter((i) => i.body.includes(mark));
      const out: string[] = [];
      if (!notes.length) out.push("no staff_note row was written");
      if (issues.length !== notes.length) out.push(`${notes.length} notes but ${issues.length} issues`);
      if (issues.some((i) => /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(i.body))) out.push("an issue body holds an email address");
      return out;
    } finally {
      await sql.end();
    }
  },
};
