// What the inventory test needs that only the database holds: the two people it signs in as, and the concrete address of a screen
// whose route has a [param]. Built from the test's own rows (a class of the test's own, its children made from tests/fake-names.ts),
// so it proves the same thing on a database built from the repository as on a copy of live.
import { createHmac } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import postgres, { type Sql } from "postgres";
import { issuesMade } from "./github-server";
import { dayIn } from "../lib/school-clock";
import { SIGNED_IN } from "../playwright.config";
import { aClass, aPerson, aTaughtClass, personAsStored } from "./rows";
import { curriculumRows, gate, offers } from "./m1-13-rows";
import { FAKE_CHILDREN } from "./fake-names";
import { assessmentFixtures } from "./inventory-assessments";
import { correctedPair, seedSetupContent, setupContentAddresses, setupContentChecks } from "./inventory-setup-content";
import { seedTeaching, type Teaching } from "./inventory-teaching";
import { markCorrected, typedNoteWritten, VOICE, voiceGone, voiceRest } from "./inventory-voice";
import { LESSON_DAY, todayGone, todayRest } from "./inventory-today";
import { acrossGone, acrossRest } from "./inventory-across";

export const SECTION = "U70A";
export const EDUCATOR = { email: "u70-educator@cornerstone.test", name: "Inventory Educator", role: "educator", classes: [SECTION], subjects: ["NUM"] };

export const OTHER = "U70B";

/** The count of skills waiting when the run began: an approval must take it below this (a run that is tried again starts lower, and the check still holds). */
let waitingAtStart = Infinity;
const QUESTION_WORDS = "Read the question and write your answer.";
const questionKey = async (sql: Sql) => (await sql<{ item_key: string }[]>`select item_key from item where fmt = 'word_1step' and source = 'generated' order by created_at, item_key limit 1`)[0].item_key;

export type Rows = { questionKey: string; assessment: { key: string; roll: string }; section: string; classId: string; children: Record<string, string>; rolls: Record<string, string>; other: Record<string, string>; otherNames: string[]; teaching: Teaching };

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
  const teaching = await seedTeaching(sql, cls?.id ?? "", EDUCATOR.email);
  const [{ week }] = await sql<{ week: string }[]>`select to_char(now(), 'IYYY-"W"IW') as week`;
  const assessment = { key: ["focus", SECTION, week, ""].join("~"), roll: "1" };
  // Setup content (UI-11): a class that is taught something, so the bank lists questions; the K2 gate open (the "reviewer" mode) with two
  // offered skills waiting; the question the screens open, ready and worded without a number
  await aTaughtClass(sql);
  await gate(sql, "reviewer");
  const { skills } = await curriculumRows(sql);
  // other specs name 22 children "Placeholder" (tests/k2-rows.ts): an activity of that name would be read by the words check as a child's name on the page
  await sql`update activity set name = replace(name, 'Placeholder', 'Sample') where code like 'ACT-K2-M113-%'`;
  await offers(sql, skills);
  await seedSetupContent(sql, skills);
  waitingAtStart = Number((await sql<{ n: string }[]>`select count(*)::text as n from skill where status <> 'ratified'`)[0].n);
  await sql`update item set status = 'active', stem = ${QUESTION_WORDS} where item_key = (select item_key from item where fmt = 'word_1step' and source = 'generated' order by created_at, item_key limit 1)`;
  const [q] = await sql<{ item_key: string }[]>`select item_key from item where fmt = 'word_1step' and source = 'generated' order by created_at, item_key limit 1`;
  return { questionKey: q?.item_key ?? "", assessment, section: SECTION, classId: cls?.id ?? "", children, rolls, other, otherNames, teaching };
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
  // the voice screens: a note waiting for the inventory educator, and a lesson of today (made by FIXTURES["voice-rest"])
  const voice = route === "/notes/[id]" ? { id: VOICE.note } : route === "/period/[id]" ? { id: VOICE.lesson } : {};
  // the teaching screens' [code] is an activity's, an objective's, a skill's or a skill set's by the route it sits in
  const code = route.includes("/activities/") ? rows.teaching.activity : route.includes("/objectives/") ? rows.teaching.objective : route.includes("/skill-sets/") ? rows.teaching.skillSet : rows.teaching.skill;
  const given: Record<string, string> = { class: rows.classId, section: rows.section, roll: rows.assessment.roll, id: first, code, key: route.includes("/question-bank/") ? rows.questionKey : rows.assessment.key, ...voice, ...over };
  const path = route.replace(/\[(\w+)\]/g, (_, k: string) => {
    if (!(k in given)) throw new Error(`tests/inventory/fixtures.ts has no fixture for [${k}] of ${route}: add one built from the test's own rows`);
    return encodeURIComponent(given[k]);
  });
  // Record is retired into the lesson page; Classes opens a class in its panel only when one is chosen (`@class-open` below)
  return path;
}

/** The coordinator's own copy of createHmac is not needed: the signed-in file holds the cookie. */
export const sessionFor = (email: string, secret = process.env.E2E_AUTH_SECRET!) => {
  const body = `${Buffer.from(email).toString("base64url")}.${Date.now() + 3_600_000}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
};

/** The rows a stateful control needs in place before it is pressed, by the name an element's `drive.fixture` gives (tests/inventory/drivers.ts). */
export const FIXTURES: Record<string, () => Promise<void>> = {
  // the inventory's question, ready to print again and worded without a number (a correction keeps every number, so a wording with none can be reworded freely)
  "question-live": async () => {
    await quiet();
    await aside(async (sql) => {
      await sql`update item set status = 'active', stem = ${QUESTION_WORDS} where item_key = ${await questionKey(sql)}`;
    });
  },
};
/** What a control must have done to the rows, by the name an element's `drive.expect.check` gives: the problems, [] when it holds. */
export const CHECKS: Record<string, () => Promise<string[]>> = {
  // Setup content (UI-11). A press on a server action returns before its work is done (the engine rebuilds worksheets when a question changes),
  // so each check waits for the rows.
  ...setupContentChecks(aside, settles),
  "one-skill-approved": async () => {
    const n = await settles(draftSkills, (v) => v < waitingAtStart);
    return n < waitingAtStart ? [] : [`${n} skills wait after an approval, as before (${waitingAtStart})`];
  },
  // a corrected question exists (made by this press, or by an earlier try of this run: the same wording is refused a second time), and a moment is
  // given for the press to retire the old one, so a revival that comes first is not undone by it
  "question-corrected": async () => {
    const read = () =>
      aside(async (sql) => (await sql<{ made: string; status: string }[]>`
        select (select count(*) from item c where c.corrected_from = o.id)::text as made, o.status from item o where o.item_key = ${await questionKey(sql)}`)[0]);
    const r = await settles(read, (v) => Number(v.made) > 0);
    if (Number(r.made) > 0 && r.status !== "retired") await new Promise((res) => setTimeout(res, 3_000));
    return Number(r.made) > 0 ? [] : ["no corrected question was made, and the old one does not point to one"];
  },
  "question-removed": async () => {
    const st = await settles(() => aside(async (sql) => (await sql<{ status: string }[]>`select status from item where item_key = ${await questionKey(sql)}`)[0].status), (v) => v === "retired");
    return st === "retired" ? [] : [`the question is ${st}, not retired`];
  },
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

/** Other addresses of a screen, by name, where the rows are in another state (`when: "@name"`): filled by `anAssessment`. */
export const ADDRESSES: Record<string, () => Promise<string>> = {
  ...setupContentAddresses(aside),
  // the inventory's question after a correction: the old one removed (it says so and opens the corrected one), and the corrected one (it opens the original)
  "removed-question": () => aside(async (sql) => `/setup/question-bank/${(await correctedPair(sql, QUESTION_WORDS)).old}`),
  "corrected-question": () => aside(async (sql) => `/setup/question-bank/${(await correctedPair(sql, QUESTION_WORDS)).fresh}`),
};

const own = () => postgres(process.env.DATABASE_URL!, { max: 1 });
async function aside<T>(f: (sql: Sql) => Promise<T>): Promise<T> {
  const sql = own();
  try {
    return await f(sql);
  } finally {
    await sql.end();
  }
};
const assessments = assessmentFixtures({ aside, ADDRESSES, SECTION });
Object.assign(FIXTURES, assessments.FIXTURES);
Object.assign(CHECKS, assessments.CHECKS);

const draftSkills = () => aside(async (sql) => Number((await sql<{ n: string }[]>`select count(*)::text as n from skill where status <> 'ratified'`)[0].n));
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
    const n = await aside(async (sql) => Number((await sql<{ n: string }[]>`select count(*)::text as n from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state = 'active'`)[0].n));
    calm = n === 0 ? calm + 1 : 0;
    await new Promise((r) => setTimeout(r, 400));
  }
}

// ---- the voice screens (UI-3a), made in inventory-voice.ts ----
FIXTURES["voice-rest"] = () => voiceRest(aside, SECTION, EDUCATOR);
FIXTURES["voice-gone"] = () => voiceGone(aside);
// ---- the two Todays (page charter B1, B1b), made in inventory-today.ts ----
FIXTURES["today-rest"] = () => todayRest(aside, SECTION, EDUCATOR);
FIXTURES["today-gone"] = () => todayGone(aside);
/** The educator's Today on the fixture class's lesson day: the lesson in the panel, its tabs and its links drawn. */
ADDRESSES["today-lesson"] = async () => `/today?day=${LESSON_DAY}`;
/** The school's Today with its "Answers to check" row open on the right (the inventory's assessments leave answers to check). */
ADDRESSES["today-wait"] = async () => "/today?open=wait:group-answers";
/** The school's Today with the fixture class's topics to mark as taught open on the right, where each task's "Mark as taught" is drawn. */
ADDRESSES["today-taught"] = async () => `/today?class=${SECTION}&open=wait:group-taught`;
let taughtBefore: unknown = {};
/** The fixture class's taught topics as they are before "Mark as taught" is pressed, and put back after: a topic marked taught is the class's own row. */
FIXTURES["taught-rest"] = () => aside(async (sql) => void (taughtBefore = (await sql<{ taught: unknown }[]>`select taught from school_class where label = ${SECTION} order by created_at limit 1`)[0]?.taught ?? {}));
FIXTURES["taught-gone"] = () => aside(async (sql) => void (await sql`update school_class set taught = ${sql.json(taughtBefore as never)} where label = ${SECTION}`));
// ---- Across every class (page charter Part C), made in inventory-across.ts ----
FIXTURES["across-rest"] = () => acrossRest(aside, SECTION);
FIXTURES["across-gone"] = () => acrossGone(aside);
/** Across with the fixture class open on the right: every tab's rows are drawn (an answer waiting, a paper not back, a child needing help). */
ADDRESSES["across-class"] = async () => {
  const [c] = await aside((sql) => sql<{ id: string }[]>`select id::text from school_class where label = ${SECTION} order by created_at limit 1`);
  return `/across?open=class:${c.id}`;
};

/** The confirm screen on a note already confirmed, where "Correct this note" is drawn. */
ADDRESSES["confirmed-note"] = async () => `/notes/${VOICE.done}`;
/** Notes with the waiting note open in the panel on the right (page charter Part C, "Notes / A note"). */
ADDRESSES["note-open"] = async () => `/notes?open=note:${VOICE.note}`;
CHECKS["typed-note-written"] = () => typedNoteWritten(aside, SECTION);
CHECKS["mark-corrected"] = () => markCorrected(aside);

/** Staff and classes with a person's grants open (`when: "@grants"`): a person of the inventory's own, with one open class grant for a role this page
 *  gives, so Add a grant and End a grant both have a person to act on. Made if it is not there; nobody else's reach changes. → the person's id. */
const GRANT_PERSON = { email: "inventory.grants@cornerstone.test", name: "Grants Fixture", role: "educator", classes: [] as string[] };
/** Today on the school's clock (config `school.time_zone`), as Staff reads it when it ends a grant: never the database's UTC date, which is
 *  a day behind the school's from 18:30 to midnight UTC (the school in India). */
const schoolDay = async (sql: Sql) => dayIn((await sql<{ z: string }[]>`select value #>> '{}' as z from config where key = 'school.time_zone'`)[0].z, new Date());
const personWithAGrant = () =>
  aside(async (sql) => {
    const { id } = await aPerson(sql, GRANT_PERSON);
    const today = await schoolDay(sql);
    const open = await sql`select 1 from staff_role_grant where staff_id = ${id}::uuid and (valid_to is null or valid_to > ${today}::date)`;
    if (!open.length) {
      await sql`insert into staff_role_grant (tenant_id, staff_id, role_code, school_class_id, valid_from, granted_by)
        select s.tenant_id, s.id, ro.code, sc.id, ${today}::date, 'inventory'
        from staff s, school_class sc, role ro
        where s.id = ${id}::uuid and sc.tenant_id = s.tenant_id and ro.tenant_id = s.tenant_id
          and ro.access_group = 'own_classes' and ro.scope = 'class' and not ro.one_per_class
        order by sc.label, ro.code limit 1`;
    }
    return id;
  });
ADDRESSES.grants = async () => `/setup/staff?open=person:${await personWithAGrant()}`;
/** Classes with the inventory's own class open in the panel, so its children are the fake ones and not whatever other specs left behind. */
ADDRESSES["class-open"] = () => aside(async (sql) => `/setup/classes?open=class:${(await sql<{ id: string }[]>`select id::text from school_class where label = ${SECTION} order by created_at limit 1`)[0].id}`);
/** Skills to approve with a skill waiting open in the panel (its levels and its own Approve). */
ADDRESSES["skill-open"] = () =>
  aside(async (sql) => {
    // a skill waiting (another spec, or this run's Approve, may have left none): the first skill is put back to waiting when none is
    const [waiting] = await sql<{ code: string }[]>`select code from skill where status <> 'ratified' order by code limit 1`;
    const code = waiting?.code ?? (await sql<{ code: string }[]>`update skill set status = 'draft', ratified_by = null where code = (select code from skill order by code limit 1) returning code`)[0].code;
    return `/setup/skills/approve?open=skill:${code}`;
  });
/** The Question bank with the inventory's question open in the panel (every grade, so the question's own grade is never filtered away). */
ADDRESSES["bank-question"] = () => aside(async (sql) => `/setup/question-bank?grade=all&open=question:${await questionKey(sql)}`);
FIXTURES["grant-to-end"] = async () => void (await personWithAGrant());
/** End a grant: the grant is ended today and its row is still there, with its dates; nothing was deleted. */
CHECKS["grant-ended"] = () =>
  aside(async (sql) => {
    const rows = await sql<{ valid_to: string | null }[]>`select g.valid_to::text from staff_role_grant g join pii.staff p on p.staff_id = g.staff_id
      where p.email = ${GRANT_PERSON.email} order by g.created_at desc limit 1`;
    const today = await schoolDay(sql);
    return rows.length && rows[0].valid_to === today ? [] : ["the grant is not ended today, or its row is gone"];
  });
