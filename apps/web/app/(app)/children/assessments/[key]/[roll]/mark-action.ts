"use server";

import { deciding, mustSee } from "@/lib/decides";
import { sql } from "@/lib/db";

const UUID = /^[0-9a-f-]{36}$/;
export type Mark = "right" | "wrong" | "working" | "blank";
export type Marked = { ok: true; mark: Mark } | { ok: false; error: string };
const STATUS = { right: "correct", wrong: "wrong", working: "wrong", blank: "blank" } as const;

/** One answer settled by a press (CP-62), with no page change: right, wrong, wrong with working, or blank. Wrong with working is a wrong answer whose
 *  working shows (`working_shown`), so the three signals stay three (rule 5). Only an answer still with the person is written; one already settled
 *  is left as it is and answered as it stands, so a double press saves once. Who judged it is a `read_correction` row beside the engine's read. */
export async function markAnswer(input: { result: string; paper: string; mark: string }): Promise<Marked> {
  const me = await deciding("answers");
  const { result, paper, mark } = input;
  if (!UUID.test(result) || !UUID.test(paper) || !(mark in STATUS)) return { ok: false, error: "That is not an answer to mark." };
  await mustSee(me, "answers", [{ result }, { sheet: paper }]);
  const status = STATUS[mark as Mark];
  const working = mark === "working" ? "partial" : "none";
  await sql`
    with judged as (
      update item_result set status = ${status}, working_shown = ${working}, misconception_codes = '{}', updated_at = now()
      where id = ${result}::uuid and state = 'candidate' and status = 'needs_teacher'
      returning tenant_id, capture_id, coalesce(raw_read::jsonb ->> 'child_answer', '') as read
    )
    insert into read_correction (tenant_id, child_id, capture_id, item_result_id, model_read, human_read, by, judged)
    select j.tenant_id, si.child_id, c.id, ${result}::uuid, j.read, j.read, ${me.email}, ${status}
    from judged j join capture c on c.id = j.capture_id join sheet_instance si on si.id = c.sheet_instance_id`;
  const [now] = await sql<{ status: string; working_shown: string }[]>`select status, working_shown from item_result where id = ${result}::uuid`;
  if (!now) return { ok: false, error: "That answer is not there." };
  const said: Mark | null = now.status === "correct" ? "right" : now.status === "blank" ? "blank" : now.status === "wrong" ? (now.working_shown !== "none" ? "working" : "wrong") : null;
  return said ? { ok: true, mark: said } : { ok: false, error: "The engine has not read this one yet, so it cannot be marked here." };
}
