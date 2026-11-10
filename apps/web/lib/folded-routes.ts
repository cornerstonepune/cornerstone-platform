// Where a folded page now lives (UI-4): an old address that names a paper, or an assessment, answers 308 to the screen that took it over.
import { sql } from "./db";
import { papersCte } from "./queries-papers";
import { assessmentHref, paperHref } from "./assessment-ui";

/** A paper's address on the paper screen, from its id or its printed code; null for none. */
export async function paperAddress(by: { id?: string; qr?: string }): Promise<string | null> {
  const [r] = await sql<{ kind: string; section: string | null; week: string | null; set_key: string | null; roll_no: string | null }[]>`
    with ${papersCte()}
    select kind, section, week, set_key, roll_no from papers where ${by.id ? sql`id = ${by.id}::uuid` : sql`qr = ${by.qr ?? ""}`} limit 1`;
  if (!r) return null;
  const key = [r.kind, r.section ?? "", r.week ?? "", r.set_key ?? ""].join("~");
  return r.roll_no ? paperHref(key, r.roll_no) : assessmentHref(key);
}
