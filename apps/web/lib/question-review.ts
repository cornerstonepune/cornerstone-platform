import { sql } from "./db";

// What the reviewer model said of a question (`eval_case`, kind `item_review`, one row per reviewer and question): who, the
// verdict and its note, and the day. Read for the Question screen's chip; the review itself is the engine's (w1_bank/review.py).
export type Review = { reviewer: string; verdict: string; note: string; day: string };

export async function reviewOf(key: string): Promise<Review | null> {
  const [r] = await sql<{ source: string; verdict: string | null; note: string | null; day: string }[]>`
    select source, verdict, detail ->> 'note' as note, to_char(updated_at, 'FMDD-Mon') as day
    from eval_case where kind = 'item_review' and ref = ${key} order by updated_at desc limit 1`;
  return r?.verdict ? { reviewer: r.source, verdict: r.verdict, note: r.note ?? "", day: r.day } : null;
}

export type Outcomes = { right: number; wrong: number; wrongWithWorking: number; blank: number; topCode: string | null; topTimes: number };

/** How a question has done on papers: the confirmed results only (the graph's own rule, rule 4), the three signals kept apart
 *  (rule 5): right, wrong, wrong with working shown, blank; and the mistake named most often. */
export async function outcomesOf(key: string): Promise<Outcomes> {
  const [o] = await sql<{ right: number; wrong: number; working: number; blank: number }[]>`
    select count(*) filter (where r.status = 'correct')::int as right,
           count(*) filter (where r.status = 'wrong' and r.working_shown = 'none')::int as wrong,
           count(*) filter (where r.status = 'wrong' and r.working_shown <> 'none')::int as working,
           count(*) filter (where r.status = 'blank')::int as blank
    from item_result r join item i on i.id = r.item_id
    where i.item_key = current_item_key(${key}) and r.state = 'confirmed'`;
  const [top] = await sql<{ code: string; times: number }[]>`
    select c as code, count(*)::int as times
    from item_result r join item i on i.id = r.item_id cross join lateral unnest(r.misconception_codes) c
    where i.item_key = current_item_key(${key}) and r.state = 'confirmed'
    group by c order by times desc, c limit 1`;
  return { right: o.right, wrong: o.wrong, wrongWithWorking: o.working, blank: o.blank, topCode: top?.code ?? null, topTimes: top?.times ?? 0 };
}
