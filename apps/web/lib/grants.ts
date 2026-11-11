// What a coordinator may give on Staff and classes, and the two writes (UI-5, #590). The rules are the engine's
// (`POST /staff/grants`, `/give`, `/end`; engine/w3_read/staff_grants.py): which roles this page gives, which classes and
// subjects the campus has, and what the grant table answers when a grant clashes. The site asks and shows the answer in the
// engine's own words; it keeps no list of roles (rule 1) and writes no grant itself (app_web cannot).
import { EngineDown, engineSend } from "./engine";
import { sql, TENANT_SLUG } from "./db";

export type GivableRole = { code: string; label: string; scope: string; one_per_class: boolean };
export type Givable = { roles: GivableRole[]; classes: string[]; subjects: { code: string; label: string }[] };

/** The roles, classes and subjects a coordinator may pick from; null while the engine cannot be asked. */
export async function givable(actor: string): Promise<Givable | null> {
  try {
    const res = await engineSend("/staff/grants", { actor });
    if (!res.ok) return null;
    const got = (await res.json()) as { roles: GivableRole[]; classes: string[]; subjects: string[] };
    const named = await sql<{ code: string; label: string }[]>`select code, coalesce(label, name) as label from subject where tenant_id = (select id from tenant where slug = ${TENANT_SLUG})`;
    const label = new Map(named.map((r) => [r.code, r.label]));
    return { roles: got.roles, classes: got.classes, subjects: got.subjects.map((code) => ({ code, label: label.get(code) ?? code })) };
  } catch (e) {
    if (e instanceof EngineDown) return null;
    throw e;
  }
}

/** What a person is told after pressing Save or End: the engine's words, and whether a reason would let the grant stand. */
export type Said = { ok: boolean; said: string; reason?: boolean } | null;

const NOT_A_COORDINATOR = "Only the coordinators can change who holds a class.";

/** One write to the engine, answered in words. A 409 is the grant table asking for a reason (a second class educator, a clash); the
 *  engine's text is the database's own. */
export async function writeGrant(path: "/staff/grants/give" | "/staff/grants/end", body: Record<string, unknown>, done: string): Promise<Said> {
  let res: Response;
  try {
    res = await engineSend(path, body as never);
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, said: e.message };
    throw e;
  }
  if (res.ok) return { ok: true, said: done };
  const detail = ((await res.json().catch(() => ({}))) as { detail?: unknown }).detail;
  // the grant table's messages start with the name of the check (`one_per_class: the class already has …`): the words after it are the sentence
  const plain = typeof detail === "string" ? detail.replace(/^[a-z_]+:\s*/, "") : "";
  const words = plain ? plain.charAt(0).toUpperCase() + plain.slice(1) : "That could not be saved.";
  if (res.status === 403) return { ok: false, said: NOT_A_COORDINATOR };
  return { ok: false, said: words, reason: res.status === 409 && path === "/staff/grants/give" };
}
