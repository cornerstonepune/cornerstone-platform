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
export async function correctedPair(sql: Sql, old: string, words: string): Promise<{ old: string; fresh: string }> {
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

