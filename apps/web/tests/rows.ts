/**
 * Rows a browser test builds for itself — a class, a worksheet the engine enters, papers read — so it proves the same
 * thing on a database built from the repository (`bin/testdb fresh`, what CI runs) as on a copy of live: never
 * "whatever live holds", and never a skip because live held nothing (goals/p1-browser-tests-in-ci.yaml). The engine
 * tests' own are packages/engine/tests/rows.py.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type postgres from "postgres";
import type { Locator } from "@playwright/test";

type Sql = postgres.Sql;
/** A connection or a transaction on one: what a spec writes its rows through. */
type Writer = postgres.Sql | postgres.TransactionSql;

async function tenant(sql: Writer): Promise<string> {
  return (await sql<{ id: string }[]>`select id from tenant limit 1`)[0].id;
}

/** A setting as a test needs it, for the school; the function it returns puts the value it had back. Every setting,
 *  numbers included, is a `config` row (CP-27): the one helper a browser test changes one through. */
export async function aSetting(sql: Sql, key: string, value: Parameters<Sql["json"]>[0]): Promise<() => Promise<void>> {
  const [was] = await sql<{ value: Parameters<Sql["json"]>[0] }[]>`select value from config where key = ${key}`;
  await sql`update config set value = ${sql.json(value)} where key = ${key}`;
  return async () => {
    await sql`update config set value = ${sql.json(was.value)} where key = ${key}`;
  };
}

/** A skill waiting for the coordinator's approval, as a test needs one. The copy starts with every level approved, as
 *  live has them (`bin/testdb`, goals/b2-question-types-are-rows.yaml), so this withdraws the skill's level approvals;
 *  the function it returns puts them back, so no other test finds a level a paper may not draw. */
export async function aWaitingSkill(sql: Sql, code: string): Promise<() => Promise<void>> {
  const [{ approved }] = await sql<{ approved: Parameters<Sql["json"]>[0] }[]>`
    select level_approved as approved from skill where code = ${code}`;
  await sql`update skill set level_approved = '{}'::jsonb where code = ${code}`;
  return async () => {
    await sql`update skill set level_approved = ${sql.json(approved)} where code = ${code}`;
  };
}

/** A way of asking (a question type) waiting for approval, as a new one is. Approvals are rows of the one approval list
 *  (`approval`, never edited; CP-27), so a browser test withdraws, approves and forgets them only through these: a way
 *  taken back is a `withdrawn` row. */
export async function aWaitingWay(sql: Sql, code: string): Promise<void> {
  await sql`
    insert into approval (tenant_id, kind, target, decision, by)
    select tenant_id, kind, target, 'withdrawn', 'a browser test' from approval_list
    where kind = 'question_type' and target = ${code} and first_by is not null`;
}

/** A way of asking approved by `by`, unless it already is; the function it returns takes back only an approval this
 *  made, so a way approved before the test stays approved after it. */
export async function anApprovedWay(sql: Sql, code: string, by: string): Promise<() => Promise<void>> {
  const made = await sql`
    insert into approval (tenant_id, kind, target, decision, by)
    select tenant_id, kind, target, 'approved', ${by} from approval_list
    where kind = 'question_type' and target = ${code} and first_by is null returning 1`;
  return async () => {
    if (made.length) await aWaitingWay(sql, code);
  };
}

/** The flags (approval rows of a question) a test left on questions taken back: every flag whose note is like `note`,
 *  on `item` only if one is named. The list is never edited, so they are taken out with its rule off for that
 *  transaction (`session_replication_role`, as the engine tests' own clean-up does). The caller puts the question's own
 *  status back. */
export async function forgetFlags(sql: Sql, note: string, item?: string): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    if (item) await tx`delete from approval where kind = 'item' and target = ${item}::text and reason like ${note}`;
    else await tx`delete from approval where kind = 'item' and reason like ${note}`;
  });
}

/** A class of the test's own, `band`, its children named in roll order — made once and kept: a child some test has
 *  signed a paper off for holds evidence, which is append-only. → {name: child id} */
export async function aClass(sql: Sql, section: string, band: string, names: string[]): Promise<Record<string, string>> {
  const t = await tenant(sql);
  const kids: Record<string, string> = {};
  for (const [i, name] of names.entries()) {
    const roll = String(i + 1);
    const [had] = await sql<{ id: string }[]>`select id from child_now where section = ${section} and roll_no = ${roll}`;
    if (had) {
      kids[name] = had.id;
      continue;
    }
    const id = await aChildIn(sql, section, band, roll);
    await sql`insert into pii.child (tenant_id, child_id, first_name) values (${t}, ${id}, ${name})`;
    kids[name] = id;
  }
  return kids;
}

/** A child at roll `roll` of the class labelled `section` (made in this school year, with the year, when there is none),
 *  in grade `band`: the child row and their open enrolment (CP-27 group 4: a child's class and roll live there alone).
 *  → the child's id. */
export async function aChildIn(sql: Writer, section: string, band: string, roll: string): Promise<string> {
  const t = await tenant(sql);
  const [{ id }] = await sql<{ id: string }[]>`insert into child (tenant_id, band) values (${t}, ${band}) returning id`;
  // the access fixture's (global-setup.ts) one door to a class: the class of that label this school year, made once
  await sql`select test_fixture.enrol(${id}, ${section}, ${roll})`;
  return id;
}

/** The class a topic switched on is taught in. A fresh copy has none (`bin/testdb fresh`), and a spec that shows a
 *  taught topic's questions makes its own rather than lean on a spec that ran before it: CI splits the specs across
 *  runners. The same class m5-every-kind-draws makes, so a full run's rows are as they were. */
export const aTaughtClass = (sql: Sql) => aClass(sql, "M5-TEST", "G2", ["Asha"]);

export type Worksheet = { code: string; title: string; date: string; band: string; week: string; items: object[] };

/** A worksheet entered by the engine exactly as a school's own paper is (`engine legacy paper`), once.
 *  → its template id and its questions' ids, in order. */
export async function aWorksheet(sql: Sql, w: Worksheet): Promise<{ template: string; items: string[] }> {
  const find = () => sql<{ id: string; item_ids: string[] }[]>`
    select id, item_ids from sheet_template where source = 'legacy' and batch_id = ${w.code}`;
  if (!(await find()).length) {
    const dir = mkdtempSync(path.join(tmpdir(), "rows-"));
    const file = path.join(dir, `${w.code}.json`);
    writeFileSync(file, JSON.stringify({ ...w, pages: [{ n: 1, mask: 0 }] }));
    execFileSync(path.resolve(__dirname, "../../../bin/engine"), ["legacy", "paper", file], { env: process.env });
    rmSync(dir, { recursive: true });
  }
  const [t] = await find();
  return { template: t.id, items: t.item_ids };
}

/** The pages of these captures told as a read tells them (`engine read tell-pages`): each page's picture and printed
 *  code kept, so the paper screen says whose paper a page is from rows. A test's own papers are rows, not reads; a
 *  page left untold shows no code and no notice. */
export function pagesTold(captures: string[]): void {
  execFileSync(path.resolve(__dirname, "../../../bin/engine"), ["read", "tell-pages", ...captures], { env: process.env });
}

/** One answer as the reader left it: its status, what it read, and why it held it, if it did; `checkedBy`, the person
 *  who said what the child wrote. */
/** `box` and `boxes`: where the reading says it came from, and how many of the question's own printed boxes it was cut
 *  from (`boxes.read_page`; a reading by words has a region and no count). */
export type Read = {
  status: string; read?: string; why?: string; guess?: string; checkedBy?: string; box?: number[]; boxes?: number;
  /** The reading is the question's own answer, as a child who got it right wrote it: what the engine (or a person) reads on a right answer.
   *  A `correct` row whose reading is not the key is one the engine could not have made: the next re-mark from what was read (`again.remark`,
   *  run each time a person types a reading) says so and changes it. With `checkedBy` it is a right answer a person has checked. */
  key?: boolean;
};

/** One child's copy of a worksheet, scanned and read, an answer per entry of `reads` in question order. A paper read
 *  before under the same code is superseded, as the reader supersedes a scan it reads again: its answers stay — one a
 *  test signed off holds evidence, and evidence is append-only, so deleting them failed the next run — and nothing
 *  that reads a paper reads them. A run starts from these rows. → its sheet (sheet_instance id), its capture and its
 *  answers' ids. */
export async function aReadPaper(
  sql: Sql,
  p: { qr: string; child: string; template: string; items: string[]; reads: Read[]; file?: string },
): Promise<{ sheet: string; capture: string; results: string[] }> {
  // ADR 0029: a wrong or a blank stands once a person has said what the child wrote; the engine's word alone holds it
  // for them (`needs_teacher`). A paper with one the engine settled alone is a paper the engine cannot write.
  const alone = p.reads.filter((r) => (r.status === "wrong" || r.status === "blank") && !r.checkedBy);
  if (alone.length) throw new Error(`${p.qr}: a wrong or a blank needs checkedBy — the engine never settles one alone`);
  const t = await tenant(sql);
  const [had] = await sql<{ id: string }[]>`select id from sheet_instance where qr_code = ${p.qr} and child_id = ${p.child}`;
  const [{ id: sheet }] = had
    ? [had]
    : await sql<{ id: string }[]>`
        insert into sheet_instance (tenant_id, qr_code, sheet_template_id, child_id, print_status)
        values (${t}, ${p.qr}, ${p.template}, ${p.child}, 'returned') returning id`;
  const [{ id: capture }] = await sql<{ id: string }[]>`
    insert into capture (tenant_id, path, pages, status, sheet_instance_id)
    values (${t}, ${p.file ?? `${p.qr}.pdf`}, 1, 'processed', ${sheet}) returning id`;
  await sql`update capture set superseded_by = ${capture} where sheet_instance_id = ${sheet} and id <> ${capture}
            and superseded_by is null`;
  const results: string[] = [];
  for (const [i, r0] of p.reads.entries()) {
    const [own] = r0.key ? await sql<{ answer: string }[]>`select responses -> 0 ->> 'answer' as answer from item where id = ${p.items[i]}` : [];
    const r = r0.key ? { ...r0, read: own.answer } : r0;
    const raw = JSON.stringify({
      child_answer: r.read ?? "",
      answer_state: r.read ? "written" : "blank",
      confidence: 95,
      why: r.why ?? "",
      ...(r.guess ? { guess: r.guess } : {}),
      ...(r.box ? { box: r.box, page: 1, file_page: 1 } : {}),
      ...(r.boxes ? { boxes: r.boxes } : {}),
    });
    // the answer is to the question's own response (its first): a result naming one the question does not ask for is
    // marked against another's key, and `engine audit` refuses it (goals/md0a-every-answer-counts.yaml)
    const [{ id }] = await sql<{ id: string }[]>`
      insert into item_result (tenant_id, capture_id, item_id, rid, raw_read, status)
      select ${t}, ${capture}, id, responses -> 0 ->> 'rid', ${raw}, ${r.status} from item where id = ${p.items[i]}
      returning id`;
    if (r.checkedBy) {
      await sql`
        insert into read_correction (tenant_id, child_id, capture_id, item_result_id, model_read, human_read, by)
        values (${t}, ${p.child}, ${capture}, ${id}, ${r.read ?? ""}, ${r.read ?? ""}, ${r.checkedBy})`;
    }
    results.push(id);
  }
  return { sheet, capture, results };
}

/** One line of a paper, as the maker and a one-child paper ask for it: a topic, one of its skills, a level and how many
 *  (goals/l7-a-line-is-topic-skill-level-number.yaml). */
export async function aLine(form: Locator, i: number, topic: string, skill: string, level: string, n: string) {
  await form.getByLabel(`Topic ${i}`).selectOption(topic);
  await form.getByLabel(`Skill ${i}`).selectOption(skill);
  await form.getByLabel(`Level ${i}`).selectOption(level);
  await form.getByLabel(`Questions ${i}`).fill(n);
}

/** How many days before now the `i`th of a child's answers was signed off: each skill's answers three days apart, the
 *  first oldest, so a run of right answers spans the days and the re-check the graph asks of a secure skill, and a
 *  mistake keeps its place among them (goals/gr1-state-from-recent-evidence.yaml). `of` is each answer's skill and rung. */
export function daysAgo(of: string[], i: number): number {
  const later = of.slice(i + 1).filter((k) => k === of[i]).length;
  return 3 * later;
}

// ---------------------------------------------------------------------------------------------------------------------
// The people who sign in, as a browser test needs them (CP-27 group 4): the one place that knows where the sign-in list
// is kept. Since group 4 it is the staff tables: `staff` (active, role, classes, subjects) and `pii.staff` (name, email,
// the password hash and when it was set); the website signs a person in as their `staff.id`. A spec never names either.
// The engine tests' own are `a_person`, `forget_person`, `teaches` and `signin_list` in packages/engine/tests/rows.py.

/** A member of staff as a spec puts one on: `password` is typed (hashed here as the sign-in checks it, at node's default
 *  cost), `hash` is one already made, kept as it is. */
export type Person = {
  email: string;
  name?: string;
  role?: string;
  classes?: string[];
  subjects?: string[];
  password?: string;
  hash?: string;
};

/** `p` is someone the sign-in knows, exactly as given: someone already there with the email (on the list or taken off
 *  it) is that person, put back as given, with the id they had. → the id the website signs them in as. */
export async function aPerson(sql: Sql, p: Person): Promise<{ id: string }> {
  const { randomBytes, scryptSync } = await import("node:crypto");
  const salt = randomBytes(16).toString("hex");
  const made = p.hash ?? (p.password ? `scrypt$${salt}$${scryptSync(p.password, salt, 64).toString("hex")}` : null);
  // the access fixture's (global-setup.ts) one door: it also gives the person the grants their classes and role need
  const [me] = await sql<{ id: string }[]>`
    select test_fixture.person(${await tenant(sql)}, ${p.email}, ${p.name ?? "Placeholder Person"}, ${p.role ?? null},
                               ${p.classes ?? []}::text[], ${p.subjects ?? []}::text[], ${made})::text as id`;
  return { id: me.id };
}

/** `email` is no longer someone the sign-in knows (taken off as the engine takes a person off: inactive, no password);
 *  everyone else is as they were. */
export async function forgetPerson(sql: Sql, email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  await sql`update pii.staff set password_hash = null, password_set_at = null where email = ${e}`;
  await sql`update staff set active = false where id in (select staff_id from pii.staff where email = ${e})`;
}

/** `email` teaches `classes` (class labels) and nothing else of them changes, as the Staff page saves a person. */
export async function teaches(sql: Sql, email: string, classes: string[]): Promise<void> {
  await sql`update staff set classes = ${classes}::text[]
            where id in (select staff_id from pii.staff where email = ${email.trim().toLowerCase()})`;
}

export type Stored = { name: string; role: string; classes: string[] | null; subjects: string[] | null; password: string | null };

/** A person as the sign-in keeps them, or undefined (never put on, or taken off): `password` is the hash, null while they
 *  have none. */
export async function personAsStored(sql: Sql, email: string): Promise<Stored | undefined> {
  const [me] = await sql<Stored[]>`
    select p.name, s.role_code as role, s.classes, s.subjects, p.password_hash as password
    from pii.staff p join staff s on s.id = p.staff_id and s.active where p.email = ${email.trim().toLowerCase()}`;
  return me;
}
