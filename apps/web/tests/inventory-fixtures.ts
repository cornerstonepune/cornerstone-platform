// What the inventory test needs that only the database holds: the two people it signs in as, and the concrete address of a screen
// whose route has a [param]. Built from the test's own rows (a class of the test's own, its children made from tests/fake-names.ts),
// so it proves the same thing on a database built from the repository as on a copy of live.
import { createHmac } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import type { Sql } from "postgres";
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
  await seedSeen(sql, cls?.id ?? "");
  return { section: SECTION, classId: cls?.id ?? "", children, rolls, other, otherNames };
}

/** What the Children screens need to show something: two skills, three children seen on them (one secure, one practising, one just
 *  begun) and twelve observations for the first, so a child's timeline has a second page. Made once; observations are append-only. */
async function seedSeen(sql: Sql, classId: string) {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from activity_observation where class_id = ${classId}`;
  if (n > 0 || !classId) return;
  // the observed picture is K2's: the fixture class is that grade whatever grade it was first made in
  await sql`update school_class set grade_code = 'K2' where id = ${classId}`;
  const [{ tenant }] = await sql<{ tenant: string }[]>`select id as tenant from tenant order by created_at limit 1`;
  const [{ staff }] = await sql<{ staff: string }[]>`select staff_id::text as staff from pii.staff where email = ${EDUCATOR.email}`;
  const skills = await sql<{ code: string }[]>`select code from registry_skill where tenant_id = ${tenant} order by code limit 2`;
  await sql`insert into activity (tenant_id, code, band, strand, name, sheet_no) values (${tenant}, 'ACT-U70-1', 'K2', 'Maths', 'Sorting by size', '') on conflict (tenant_id, code) do nothing`;
  for (const k of skills) await sql`insert into activity_skill (tenant_id, activity_code, skill_code) values (${tenant}, 'ACT-U70-1', ${k.code}) on conflict do nothing`;
  const seen = async (roll: string, level: number, daysAgo: number) => {
    const [c] = await sql<{ id: string }[]>`select id from child_now where class_id = ${classId} and roll_no = ${roll}`;
    const at = new Date(Date.now() - daysAgo * 86_400_000);
    const [o] = await sql<{ id: string }[]>`
      insert into activity_observation (tenant_id, confirmation_id, activity_code, child_id, class_id, outcome, entry_mode, route, expected_level, reached_level, observed_at, observed_by, confirmed_by)
      values (${tenant}, gen_random_uuid(), 'ACT-U70-1', ${c.id}, ${classId}, 'as_expected', 'individual', 'form', 2, ${level}, ${at}, ${staff}, ${staff}) returning id`;
    for (const k of skills)
      await sql`insert into evidence_event (tenant_id, child_id, skill_code, channel, observed_at, confirmed_by, kind, mark, seen_by, place, source, observation_id)
        values (${tenant}, ${c.id}, ${k.code}, 'educator', ${at}, ${staff}, 'observed', ${level === 3 ? "yes" : level === 2 ? "sometimes" : "not_yet"}, ${staff}, 'class', 'u70 fixture', ${o.id})`;
    await sql`select rebuild_child_observed_state(${c.id})`;
  };
  for (let i = 0; i < 12; i++) await seen("1", 3, 60 - i * 3);
  await seen("2", 2, 6);
  await seen("3", 1, 4);
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
  const path = fill(route, rows, over);
  // the Children table opens on the fixture class: the full table holds every class's children, whatever other specs left behind
  return route === "/children" ? `${path}?cls=${rows.classId}` : path;
}
function fill(route: string, rows: Rows, over: Record<string, string>): string {
  const first = Object.values(rows.children)[0] ?? "";
  const given: Record<string, string> = { class: rows.classId, section: rows.section, roll: "1", id: first, ...over };
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
