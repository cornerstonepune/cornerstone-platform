// What the inventory test needs that only the database holds: the two people it signs in as, and the concrete address of a screen
// whose route has a [param]. Built from the test's own rows (a class of the test's own, its children made from tests/fake-names.ts),
// so it proves the same thing on a database built from the repository as on a copy of live.
import { createHmac } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import postgres, { type Sql } from "postgres";
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
  // twelve: one assessment of the class then has more than ten copies, so a screen can show its second page of them
  const names = FAKE_CHILDREN.slice(0, 12);
  const children = await aClass(sql, SECTION, "K2", [...names]);
  const [cls] = await sql<{ id: string }[]>`select id from school_class where label = ${SECTION} order by created_at limit 1`;
  const rolls = Object.fromEntries(names.map((n, i) => [n, String(i + 1)]));
  // a class the educator does not hold, with Sr. Nos 13 and 14 that the educator's class has no child for
  const otherNames = FAKE_CHILDREN.slice(12, 26) as unknown as string[];
  const other = await aClass(sql, OTHER, "K2", otherNames);
  // Setup content (UI-11): a class that is taught something, so the bank lists questions; the K2 curriculum pages open (the gate's
  // "reviewer" mode) with two offered skills waiting; a question to open
  await aTaughtClass(sql);
  await gate(sql, "reviewer");
  const { skills } = await curriculumRows(sql);
  // other specs name 22 children "Placeholder" (tests/k2-rows.ts): an activity of that name would be read by the words check as a child's name on the page
  await sql`update activity set name = replace(name, 'Placeholder', 'Sample') where code like 'ACT-K2-M113-%'`;
  await offers(sql, skills);
  waitingAtStart = Number((await sql<{ n: string }[]>`select count(*)::text as n from skill where status <> 'ratified'`)[0].n);
  // the question the screens open: ready, and worded without a number
  await sql`update item set status = 'active', stem = ${QUESTION_WORDS} where item_key = (select item_key from item where fmt = 'word_1step' and source = 'generated' order by created_at, item_key limit 1)`;
  const [q] = await sql<{ item_key: string }[]>`
    select i.item_key from item i where i.fmt = 'word_1step' and i.source = 'generated' order by i.created_at, i.item_key limit 1`;
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

/** The inventory's own connection, for the fixtures and checks below (the test file's is private to it). */
let own: Sql | undefined;
const db = () => (own ??= postgres(process.env.DATABASE_URL!, { max: 1 }));
/** The count of skills waiting when the run began: an approval must take it below this (a run that is tried again starts lower, and the check still holds). */
let waitingAtStart = Infinity;
const QUESTION_WORDS = "Read the question and write your answer.";
const openOffers = async () =>
  Number((await db()<{ n: string }[]>`
    select count(*)::text as n from curriculum_proposal p
    where p.about is null and p.status = 'needs_person' and p.subject_code like 'ACT-K2-M113-%' and not exists (select 1 from curriculum_proposal f where f.about = p.id)`)[0].n);
const draftSkills = async () => Number((await db()<{ n: string }[]>`select count(*)::text as n from skill where status <> 'ratified'`)[0].n);
/** A press on a server action returns before its work is done (the engine rebuilds worksheets when a question changes): the check waits for the rows. */
async function settles<T>(read: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  let v = await read();
  for (let i = 0; i < 40 && !ok(v); i++) {
    await new Promise((r) => setTimeout(r, 500));
    v = await read();
  }
  return v;
}
/** The engine's work after a press (worksheets rebuilt, rows retired) goes on a moment after the press has returned: a fixture that revives a row waits until no other connection is busy. */
async function quiet() {
  let calm = 0;
  for (let i = 0; i < 60 && calm < 3; i++) {
    const [{ n }] = await db()<{ n: string }[]>`select count(*)::text as n from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state = 'active'`;
    calm = Number(n) === 0 ? calm + 1 : 0;
    await new Promise((r) => setTimeout(r, 400));
  }
}
const questionKey = async () => (await db()<{ item_key: string }[]>`select item_key from item where fmt = 'word_1step' and source = 'generated' order by created_at, item_key limit 1`)[0].item_key;

/** The rows a stateful control needs in place before it is pressed, by the name an element's `drive.fixture` gives (tests/inventory/drivers.ts). */
export const FIXTURES: Record<string, () => Promise<void>> = {
  // the inventory's question, ready to print again and worded without a number (a correction keeps every number, so a wording with none can be reworded freely)
  "question-live": async () => {
    await quiet();
    await db()`update item set status = 'active', stem = ${QUESTION_WORDS} where item_key = ${await questionKey()}`;
  },
};
/** What a control must have done to the rows, by the name an element's `drive.expect.check` gives: the problems, [] when it holds. */
export const CHECKS: Record<string, () => Promise<string[]>> = {
  "offer-answered": async () => {
    const n = await settles(openOffers, (v) => v <= 1);
    return n <= 1 ? [] : [`${n} offers are waiting after one answer, of 2`];
  },
  "no-offer-left": async () => {
    const n = await settles(openOffers, (v) => v === 0);
    return n === 0 ? [] : [`${n} offers are still waiting after both were answered`];
  },
  "one-skill-approved": async () => {
    const n = await settles(draftSkills, (v) => v < waitingAtStart);
    return n < waitingAtStart ? [] : [`${n} skills wait after an approval, as before (${waitingAtStart})`];
  },
  // a corrected question exists (made by this press, or by an earlier try of this run: the same wording is refused a second time), and a moment is given for
  // the press to retire the old one, so a revival that comes first is not undone by it
  "question-corrected": async () => {
    const read = async () =>
      (await db()<{ made: string; status: string }[]>`
        select (select count(*) from item c where c.corrected_from = o.id)::text as made, o.status from item o where o.item_key = ${await questionKey()}`)[0];
    const r = await settles(read, (v) => Number(v.made) > 0);
    if (Number(r.made) > 0 && r.status !== "retired") await new Promise((res) => setTimeout(res, 3_000));
    return Number(r.made) > 0 ? [] : ["no corrected question was made, and the old one does not point to one"];
  },
  "question-removed": async () => {
    const st = await settles(async () => (await db()<{ status: string }[]>`select status from item where item_key = ${await questionKey()}`)[0].status, (v) => v === "retired");
    return st === "retired" ? [] : [`the question is ${st}, not retired`];
  },
};
