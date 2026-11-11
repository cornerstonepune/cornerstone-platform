// What the inventory test needs that only the database holds: the two people it signs in as, and the concrete address of a screen
// whose route has a [param]. Built from the test's own rows (a class of the test's own, its children made from tests/fake-names.ts),
// so it proves the same thing on a database built from the repository as on a copy of live.
import { createHmac } from "node:crypto";
import type { Browser, BrowserContext } from "@playwright/test";
import postgres, { type Sql } from "postgres";
import { issuesMade } from "./github-server";
import { SIGNED_IN } from "../playwright.config";
import { aClass, aPerson, aReadPaper, aTaughtClass, personAsStored } from "./rows";
import { curriculumRows, gate, offers } from "./m1-13-rows";
import { FAKE_CHILDREN } from "./fake-names";
import { seedTeaching, type Teaching } from "./inventory-teaching";
import { markCorrected, typedNoteWritten, VOICE, voiceGone, voiceRest } from "./inventory-voice";

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
  // the teaching screens' [code] is an activity's, an objective's or a skill's by the route it sits in
  const code = route.includes("/activities/") ? rows.teaching.activity : route.includes("/objectives/") ? rows.teaching.objective : rows.teaching.skill;
  const given: Record<string, string> = { class: rows.classId, section: rows.section, roll: rows.assessment.roll, id: first, code, key: route.includes("/question-bank/") ? rows.questionKey : rows.assessment.key, ...voice, ...over };
  const path = route.replace(/\[(\w+)\]/g, (_, k: string) => {
    if (!(k in given)) throw new Error(`tests/inventory/fixtures.ts has no fixture for [${k}] of ${route}: add one built from the test's own rows`);
    return encodeURIComponent(given[k]);
  });
  // Classes and children opens one class below its table: the test's own, so the children are the fake ones above and not whatever other specs left in the first
  // Record opens on the fixture class, so the person holding several classes is not asked which one first
  return route === "/setup/classes" || route === "/record" ? `${path}?class=${rows.classId}` : path;
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

/** One home assessment of the class this week with a copy in every state a screen draws: Sr. No. 1 read with a wrong, a blank, a right and an
 *  answer for a person to judge; 2 read and settled (to sign off); 3 signed off; 4 to 9 and 12 made (waiting for approval); 10 printed; 11 made
 *  and then made again (the first is replaced by the newer). Twelve children, so it has a second page of copies. Made once and kept: a paper
 *  signed off holds evidence, which is append-only. → its key (kind, class, week, set) and the Sr. No. whose paper has an answer to judge. */
/** The printed codes of the rows one run of the fixture makes: CS, four hex of the run, two hex of the copy (QR codes are CS and six hex). */
let RUN = "0000";
/** The answer on Sr. No. 1's paper that is for a person to judge, by its id: the engine rewrites what it read when it marks, so no wording finds it again. */
let JUDGE = "";
/** The name the inventory types into a rename field. */
const NAMED = "Named in the inventory";
/** The file the inventory has been read lately. */
const SCAN = "Inventory scan.pdf";
let SETTLED_CAPTURES: string[] = [];
const code = (n: number) => `CS${RUN}${n.toString(16).toUpperCase().padStart(2, "0")}`;

export async function anAssessment(sql: Sql, children: Record<string, string>): Promise<{ key: string; roll: string }> {
  SETTLED_CAPTURES = [];
  const kids = Object.values(children);
  const [{ tenant, week }] = await sql<{ tenant: string; week: string }[]>`
    select tenant_id as tenant, to_char(now(), 'IYYY-"W"IW') as week from child_now where id = ${kids[0]}`;
  const [ws] = await sql<{ id: string; item_ids: string[] }[]>`
    select t.id, t.item_ids from sheet_template t
    where t.source = 'library' and t.retired_at is null and t.band = 'G2' and cardinality(t.item_ids) >= 4 order by t.code limit 1`;
    const monday = sql`to_date(${week}, 'IYYY-"W"IW')`;
  const put = async (n: number, child: string, status: string, older = false) => {
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, created_at, approved_by, approved_at, printed_at)
      values (${tenant}, ${code(n)}, ${ws.id}, ${child}, ${SECTION}, ${monday}, 'focus', ${status}, now() - ${older ? "2 minutes" : "0 minutes"}::interval,
              ${status === "new" ? null : "e2e"}, ${status === "new" ? null : sql`now()`}, ${status === "new" ? null : sql`now()`})`;
  };
  for (const n of [7, 8, 9]) await put(n, kids[n - 1], "new");
  await put(10, kids[9], "printed");
  await put(0x70, kids[10], "new", true); // the first copy of Sr. No. 11 ...
  await put(11, kids[10], "new"); // ... replaced by this newer one
  const read = (n: number, reads: Parameters<typeof aReadPaper>[1]["reads"]) => aReadPaper(sql, { qr: code(n), child: kids[n - 1], template: ws.id, items: ws.item_ids, reads });
  {
    for (const n of [1, 2, 3]) await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at)
      values (${tenant}, ${code(n)}, ${ws.id}, ${kids[n - 1]}, ${SECTION}, ${monday}, 'focus', 'printed', 'e2e', now(), now())`;
    // copies 4 to 6 are read and settled: each run of the inventory signs one off, and a fresh copy is there for the next
    for (const n of [4, 5, 6]) {
      await sql`
        insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at)
        values (${tenant}, ${code(n)}, ${ws.id}, ${kids[n - 1]}, ${SECTION}, ${monday}, 'focus', 'printed', 'e2e', now(), now())`;
      SETTLED_CAPTURES.push((await read(n, [{ status: "correct", key: true, checkedBy: "e2e" }, { status: "correct", key: true, checkedBy: "e2e" }, { status: "correct", key: true, checkedBy: "e2e" }, { status: "correct", key: true, checkedBy: "e2e" }])).capture);
    }
    // a second copy with an answer for a person to judge: "the next paper to check"
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at)
      values (${tenant}, ${code(12)}, ${ws.id}, ${kids[11]}, ${SECTION}, ${monday}, 'focus', 'printed', 'e2e', now(), now())`;
    await read(12, [{ status: "correct", key: true, checkedBy: "e2e" }, { status: "needs_teacher", read: "8", why: "under the confidence floor" }, { status: "correct", key: true, checkedBy: "e2e" }, { status: "correct", key: true, checkedBy: "e2e" }]);
    const one1 = await read(1, [{ status: "correct", key: true, checkedBy: "e2e" }, { status: "wrong", read: "17", checkedBy: "e2e" }, { status: "blank", checkedBy: "e2e" }, { status: "needs_teacher", read: "5", why: "under the confidence floor" }]);
    const settled = [{ status: "correct", key: true, checkedBy: "e2e" }, { status: "correct", key: true, checkedBy: "e2e" }, { status: "correct", key: true, checkedBy: "e2e" }, { status: "correct", key: true, checkedBy: "e2e" }];
    JUDGE = one1.results[3];
    SETTLED_CAPTURES.push((await read(2, settled)).capture);
    const three = await read(3, settled);
    await sql`select confirm_results(${kids[2]}::uuid, 'e2e', ${three.capture}::uuid)`;
  }
  // two class assessments, so the list has a row whose next step is to check answers, and one with every paper signed off
  const [ws2] = await sql<{ id: string; item_ids: string[] }[]>`
    select t.id, t.item_ids from sheet_template t
    where t.source = 'library' and t.retired_at is null and t.band = 'G2' and cardinality(t.item_ids) >= 4 and t.id <> ${ws.id}
      and t.skill_set_code is distinct from (select skill_set_code from sheet_template where id = ${ws.id}) order by t.code limit 1`;
  const classCopy = async (n: number, template: string, items: string[], child: string, reads: Parameters<typeof aReadPaper>[1]["reads"], sign = false) => {
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at)
      values (${tenant}, ${code(n)}, ${template}, ${child}, ${SECTION}, ${monday}, 'assessment', 'printed', 'e2e', now(), now())`;
    const r = await aReadPaper(sql, { qr: code(n), child, template, items, reads });
    if (sign) await sql`select confirm_results(${child}::uuid, 'e2e', ${r.capture}::uuid)`;
  };
  await classCopy(0x81, ws.id, ws.item_ids, kids[3], [{ status: "correct", key: true, checkedBy: "e2e" }, { status: "needs_teacher", read: "5", why: "under the confidence floor" }]);
  await classCopy(0x82, ws.id, ws.item_ids, kids[4], [{ status: "correct", key: true, checkedBy: "e2e" }, { status: "correct", key: true, checkedBy: "e2e" }]);
  await classCopy(0x83, ws2.id, ws2.item_ids, kids[5], [{ status: "correct", key: true, checkedBy: "e2e" }, { status: "correct", key: true, checkedBy: "e2e" }], true);
  // nine more class assessments, one copy each, on other skill sets: with these the class has more than ten assessments, so the list has a second page
  const more = await sql<{ id: string }[]>`
    select distinct on (t.skill_set_code) t.id from sheet_template t
    where t.source = 'library' and t.retired_at is null and t.band = 'G2' and t.skill_set_code is not null
      and t.skill_set_code not in (select skill_set_code from sheet_template where id in (${ws.id}, ${ws2.id}) and skill_set_code is not null)
    order by t.skill_set_code, t.code limit 9`;
  for (const [i, t] of more.entries()) {
    await sql`
      insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, section, week, kind, print_status, approved_by, approved_at, printed_at)
      values (${tenant}, ${code(0xa0 + i)}, ${t.id}, ${kids[i % kids.length]}, ${SECTION}, ${monday}, 'assessment', 'printed', 'e2e', now(), now())`;
  }
  const key = ["focus", SECTION, week, ""].join("~");
  // a paper read and settled, nothing left to judge: the first of Sr. Nos 2, 4, 5, 6 not yet signed off (a sign-off uses one up)
  ADDRESSES.settled = async () => {
    const sql2 = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      for (const n of [2, 4, 5, 6]) {
        const open = await sql2`select 1 from item_result r join capture c on c.id = r.capture_id join sheet_instance s on s.id = c.sheet_instance_id
          where s.qr_code = ${code(n)} and c.superseded_by is null and r.state = 'candidate' limit 1`;
        if (open.length) return `/children/assessments/${encodeURIComponent(key)}/${n}`;
      }
      return `/children/assessments/${encodeURIComponent(key)}/2`;
    } finally {
      await sql2.end();
    }
  };
  return { key, roll: "1" };
}

/** Other addresses of a screen, by name, where the rows are in another state (`when: "@name"`): filled by `anAssessment`. */
export const ADDRESSES: Record<string, () => Promise<string>> = {};

const checkedCopies = async (sql: Sql) =>
  (await sql<{ n: number }[]>`select count(*)::int as n from sheet_instance where qr_code like ${`CS${RUN}%`} and kind = 'focus' and exists (
      select 1 from capture c join item_result r on r.capture_id = c.id where c.sheet_instance_id = sheet_instance.id and c.superseded_by is null and r.state = 'candidate')`)[0].n;
let before = 0;
const own = () => postgres(process.env.DATABASE_URL!, { max: 1 });
const aside = async <T>(f: (sql: Sql) => Promise<T>) => {
  const sql = own();
  try {
    return await f(sql);
  } finally {
    await sql.end();
  }
};
/** The home pack as it is before anyone approves it: every copy still waiting for approval is as made. */
FIXTURES["pack-unapproved"] = () =>
  aside(async (sql) => {
    await sql`update sheet_instance set print_status = 'new', approved_by = null, approved_at = null, printed_at = null where qr_code in (${code(7)}, ${code(8)}, ${code(9)}, ${code(11)})`;
  });
FIXTURES["pack-approved"] = () =>
  aside(async (sql) => {
    await sql`update sheet_instance set print_status = 'printed', approved_by = 'e2e', approved_at = now(), printed_at = now() where qr_code in (${code(7)}, ${code(8)}, ${code(9)}, ${code(11)})`;
  });
/** Every copy of the pack read and settled is as it was before a sign-off: its answers wait to be confirmed again (the evidence a sign-off made stays). */
FIXTURES["checked-again"] = () =>
  aside(async (sql) => {
    await sql`update item_result set state = 'candidate' where state = 'confirmed' and capture_id = any(${SETTLED_CAPTURES}::uuid[])`;
  });
FIXTURES["note-checked"] = () => aside(async (sql) => void (before = await checkedCopies(sql)));
FIXTURES["answer-to-judge"] = () =>
  aside(async (sql) => {
    // Sr. No. 1's answer is for a person to judge again (the person's earlier word stays as a row beside it)
    await sql`update item_result set status = 'needs_teacher', state = 'candidate' where id = ${JUDGE}::uuid`;
  });
CHECKS["pack-approved"] = () =>
  aside(async (sql) => {
    const left = await sql`select 1 from sheet_instance where qr_code in (${code(7)}, ${code(8)}, ${code(9)}, ${code(11)}) and print_status = 'new'`;
    const other = await sql`select 1 from sheet_instance where qr_code = ${code(10)} and print_status <> 'printed'`;
    return [...(left.length ? ["left copies of this pack unapproved"] : []), ...(other.length ? ["touched another copy"] : [])];
  });
CHECKS["a-copy-signed-off"] = () =>
  aside(async (sql) => ((await checkedCopies(sql)) < before ? [] : ["no copy was signed off"]));
CHECKS["answer-corrected"] = () =>
  aside(async (sql) => {
    const rows = await sql`select 1 from read_correction rc join item_result r on r.id = rc.item_result_id join capture c on c.id = r.capture_id
      join sheet_instance s on s.id = c.sheet_instance_id where s.qr_code = ${code(1)} and rc.human_read = '6'`;
    return rows.length ? [] : ["no read_correction row says what the child wrote"];
  });
CHECKS["answer-blank"] = () =>
  aside(async (sql) => {
    const rows = await sql`select 1 from item_result where id = ${JUDGE}::uuid and status = 'blank'`;
    return rows.length ? [] : ["the answer is not marked blank"];
  });

/** The rows the three assessment screens need, made fresh for one screen's run (`rest` in screens.json) and voided after it, so no other
 *  test sees a pack waiting for approval or a dozen more assessments: a paper made here is put away as a paper made in error is. */
FIXTURES["assessments-rest"] = () =>
  aside(async (sql) => {
    RUN = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, "0");
    const names = Object.fromEntries((await sql<{ id: string; roll: string }[]>`select id, roll_no as roll from child_now where section = ${SECTION}`).map((c) => [c.roll, c.id]));
    await anAssessment(sql, Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, names[String(i + 1)]])));
    // one file read lately, so the Reading view has a row with Read again (the engine no longer keeps it, and says so)
    await sql`insert into flow_run (tenant_id, flow, trigger, status, finished_at, result)
      select id, 'read-scan', ${`e2e@cornerstone.test: ${SCAN}`}, 'ok', now(), ${sql.json({ pages: 2, file: SCAN, copies: [] })} from tenant limit 1`;
  });
FIXTURES["assessments-gone"] = () =>
  aside(async (sql) => {
    await sql`delete from flow_run where flow = 'read-scan' and trigger like ${`%${SCAN}`}`;
    await sql`update sheet_instance set print_status = 'void' where qr_code like ${`CS${RUN}%`}`;
  });

const openOffers = () =>
  aside(async (sql) =>
    Number((await sql<{ n: string }[]>`
      select count(*)::text as n from curriculum_proposal p
      where p.about is null and p.status = 'needs_person' and p.subject_code like 'ACT-K2-M113-%' and not exists (select 1 from curriculum_proposal f where f.about = p.id)`)[0].n),
  );
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
/** The confirm screen on a note already confirmed, where "Correct this note" is drawn. */
ADDRESSES["confirmed-note"] = async () => `/notes/${VOICE.done}`;
CHECKS["typed-note-written"] = () => typedNoteWritten(aside, SECTION);
CHECKS["mark-corrected"] = () => markCorrected(aside);

/** A name an educator chose is a row of the history log and stays (rule 4); to give the built name back, a last row says an empty name,
 *  which the screens read as no chosen name (`nameOf`). Every assessment a test named gets one. */
FIXTURES["name-undone"] = () =>
  aside(async (sql) => {
    await sql`
      insert into change_log (tenant_id, table_name, row_id, op, after, origin)
      select tenant_id, 'assessment', row_id, 'name', '{"name": ""}'::jsonb, 'inventory' from (
        select distinct on (row_id) row_id, tenant_id, after ->> 'name' as name from change_log
        where table_name = 'assessment' and op = 'name' order by row_id, at desc, id desc) x
      where name = ${NAMED}`;
  });
CHECKS["assessment-renamed"] = () =>
  aside(async (sql) => {
    const rows = await sql`
      select 1 from (select distinct on (row_id) after ->> 'name' as name from change_log
        where table_name = 'assessment' and op = 'name' order by row_id, at desc, id desc) x where name = ${NAMED}`;
    return rows.length ? [] : ["no assessment has the name that was typed"];
  });
