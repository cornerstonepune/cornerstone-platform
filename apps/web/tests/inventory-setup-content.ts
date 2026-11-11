// What the setup-content screens need seeded for the inventory: offers beyond the first page, and a question with its correction.
import type { Sql } from "postgres";

export const openOffersIn = async (sql: Sql) =>
  Number((await sql<{ n: string }[]>`
    select count(*)::text as n from curriculum_proposal p
    where p.about is null and p.status = 'needs_person' and p.subject_code like 'ACT-K2-M113-%' and not exists (select 1 from curriculum_proposal f where f.about = p.id)`)[0].n);
/** Ten more skills offered for the sample activities (one each, 4 to 13), as the engine's ledger holds an offer. */
export async function moreOffers(sql: Sql, skills: string[]) {
  const [{ id: t }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const run = crypto.randomUUID();
  for (let n = 4; n <= 13; n++)
    await sql`
      insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, confidence, status, reason, machine)
      values (${t}, ${run}, 'skill_offer', ${`ACT-K2-M113-${String(n).padStart(2, "0")}`}, ${sql.json({ skills: [skills[n % skills.length]], with: [] })}, 0.7, 'needs_person', ${`Offered for sample activity ${n}.`}, 'inventory')`;
}

/** The question and its correction as the engine leaves them (a new question with `corrected_from`, the old one retired by a flag), made in the rows directly
 *  so that no press is needed to draw the page: the same insert and the same flag as `engine/w1_bank/question.py`. */
export async function correctedPair(sql: Sql, words: string): Promise<{ old: string; fresh: string }> {
  // another question than the inventory's own, so correcting it leaves the one the question screen is driven on as it was
  const [{ item_key: old }] = await sql<{ item_key: string }[]>`select item_key from item where fmt = 'word_1step' and source = 'generated' and status = 'active' order by created_at, item_key offset 1 limit 1`;
  const fresh = `FX-${old}`;
  await sql`
    insert into item (tenant_id, item_key, template, rung_code, skill_codes, signal, fmt, stem, spec, responses, tags, case_codes, source, status, skill_set_code, difficulty, eval_type, skill_set_version, generator, corrected_from)
    select tenant_id, ${fresh}, template, rung_code, skill_codes, signal, fmt, ${`${words} Read it twice.`}, spec, responses, tags, case_codes, source, 'active', skill_set_code, difficulty, eval_type, skill_set_version, 'correction', id
    from item where item_key = ${old}
    on conflict (tenant_id, item_key) do nothing`;
  await sql`
    insert into approval (tenant_id, kind, target, decision, by, reason)
    select tenant_id, 'item', id::text, 'retire', 'inventory', ${`Corrected as ${fresh}: a test`} from item where item_key = ${old} and status = 'active'`;
  return { old, fresh };
}


const openAsksIn = async (sql: Sql) => Number((await sql<{ n: string }[]>`select count(*)::text as n from ask where answer is null`)[0].n);
let offersAtStart = Infinity;
let asksAtStart = Infinity;
/** More offers than a page, every question to answer waiting, and the table of what a wrong answer counts against waiting for approval. */
export async function seedSetupContent(sql: Sql, skills: string[]) {
  await moreOffers(sql, skills);
  await sql`update config set value = '{}'::jsonb where key = 'skills.charges_by_kind.approved'`;
  await sql`update ask set answer = null, correction = null, answered_by = null, answered_at = null where answer is not null`;
  offersAtStart = await openOffersIn(sql);
  asksAtStart = await openAsksIn(sql);
  await seedProposals(sql);
  farAtStart = await openProposalsIn(sql, "mislevelled");
  mistakesAtStart = await openProposalsIn(sql, "new_mistake");
}
const openProposalsIn = async (sql: Sql, kind: string) =>
  Number((await sql<{ n: string }[]>`select count(*)::text as n from curriculum_proposal p where p.kind = ${kind} and p.about is null and not exists (select 1 from curriculum_proposal d where d.about = p.id)`)[0].n);
let farAtStart = Infinity;
let mistakesAtStart = Infinity;

/** What children's answers propose for the bank, as the engine's `learn.refresh` leaves it: two questions far off their level (one to remove,
 *  one to keep) and two ways of working (one to adopt, one to reject), each waiting for a person. The list of proposals is append-only: a run adds its own, and the checks count from what waits when it begins. */
export async function seedProposals(sql: Sql): Promise<string[]> {
  const made: string[] = [];
  const items = await sql<{ item_key: string; difficulty: string; skill_set_code: string }[]>`
    select item_key, difficulty, skill_set_code from item where fmt = 'word_1step' and source = 'generated' and status = 'active' order by created_at, item_key offset 2 limit 2`;
  const [{ id: tenant }] = await sql<{ id: string }[]>`select id from tenant order by created_at limit 1`;
  const put = async (kind: string, subject: string, direction: string, evidence: object) => {
    const [{ id }] = await sql<{ id: string }[]>`
      insert into curriculum_proposal (tenant_id, run_id, kind, subject_code, proposal, status, proposer, machine)
      values (${tenant}, gen_random_uuid(), ${kind}, ${subject}, ${sql.json({ direction, evidence } as never)}, 'needs_person', 'code', ${`inventory:${kind}`}) returning id`;
    made.push(id);
  };
  for (const it of items) await put("mislevelled", it.item_key, "easier", { n: 30, correct: 29, p_correct: 0.97, difficulty: it.difficulty, skill_set_code: it.skill_set_code });
  // two rules of working a sum, a different pair each run (an adopted one stays in the vocabulary): the parts are the engine's own (assess/learned_rules.py)
  const parts = () => ({ op: "+", write: "whole_sum", carry: "none", to: "next", last: "write", turn: "none", align: Math.random() < 0.5 ? "right" : "left" });
  for (const [rule, wrote] of [[parts(), 1115], [{ ...parts(), write: "larger" }, 49]] as const) {
    const id = [rule.op, rule.write, rule.carry, rule.to, rule.last, rule.align, rule.turn].join("|");
    await sql`delete from misconception where code = 'L_' || upper(substr(md5(${id}), 1, 6))`;
    await put("new_mistake", id, "+", { rule, words: rule.write === "larger" ? "writes the larger digit of each column" : "writes each column's whole total, both digits", examples: [{ op: "+", a: 47, b: 38, wrote, item_key: items[0]?.item_key ?? "" }] });
  }
  return made;
}

type Aside = <T>(f: (sql: Sql) => Promise<T>) => Promise<T>;
type Settles = <T>(read: () => Promise<T>, ok: (v: T) => boolean) => Promise<T>;
/** What a press on these screens must have done to the rows, by the name an element's `drive.expect.check` gives (see CHECKS in inventory-fixtures.ts). */
export const setupContentChecks = (aside: Aside, settles: Settles): Record<string, () => Promise<string[]>> => {
  const fewer = (open: (sql: Sql) => Promise<number>, start: () => number, what: string) => async (k: number) => {
    const n = await settles(() => aside(open), (v) => v <= start() - k);
    return n <= start() - k ? [] : [`${n} ${what} wait after ${k} answered, of ${start()}`];
  };
  const offers = fewer(openOffersIn, () => offersAtStart, "offers");
  const far = fewer((sql) => openProposalsIn(sql, "mislevelled"), () => farAtStart, "questions proposed for the bank");
  const mistakes = fewer((sql) => openProposalsIn(sql, "new_mistake"), () => mistakesAtStart, "mistakes proposed");
  const asks = fewer(openAsksIn, () => asksAtStart, "questions");
  return {
    "offer-answered": () => offers(1),
    "another-offer-answered": () => offers(2),
    "proposal-decided": () => far(1),
    "another-proposal-decided": () => far(2),
    "mistake-decided": () => mistakes(1),
    "another-mistake-decided": () => mistakes(2),
    "ask-answered": () => asks(1),
    "another-ask-answered": () => asks(2),
    "charges-approved": async () => {
      const by = await settles(() => aside(async (sql) => (await sql<{ by: string | null }[]>`select value ->> 'by' as by from config where key = 'skills.charges_by_kind.approved'`)[0]?.by ?? null), (v) => v !== null);
      return by ? [] : ["the table of what a wrong answer counts against is still waiting for approval"];
    },
  };
};

/** Other states of the Curriculum screen, by the name an element's `when: "@name"` gives: an address after the rows are put in that state.
 *  A change to the questions waiting moves the count the checks above measure from by the same amount, so a drive's check still means "this press". */
export const setupContentAddresses = (aside: Aside): Record<string, () => Promise<string>> => {
  const put = (change: (sql: Sql) => Promise<unknown>) => async () => {
    await aside(async (sql) => {
      const before = await openAsksIn(sql);
      await change(sql);
      asksAtStart += (await openAsksIn(sql)) - before;
    });
    return "/setup/curriculum";
  };
  return {
    // one question answered, so the folded list of answered questions is drawn
    "asks-answered": put((sql) => sql`
      update ask set answer = 'agreed', answered_by = 'Inventory Educator', answered_at = now()
      where code = (select code from ask where link is null and answer is null order by ord desc, code desc limit 1)`),
    // the question that carries a link to its full draft waiting (the first one answered by an earlier press is put back)
    "ask-with-link": put((sql) => sql`update ask set answer = null, correction = null, answered_by = null, answered_at = null where link is not null`),
  };
};
