import type { Session } from "@/lib/auth";
import { ARRIVES, type Arrived } from "./arrived-words";
import { EngineDown, engineSend } from "./engine";
import type { Claim } from "./money-format";
import { said, type Got } from "./money-queue";
import { stockCampuses } from "./stock-access";

/** What arrived against a claim (CP-86, `POST /stock/arrived`), for the claim's panel. None (null) when there is nothing to ask: a claim not yet approved or paid has
 *  no goods to record, and a person who keeps no store is never shown any of it. The engine's refusal (a keeper of another campus) comes back in its words. */
export async function arrivedOf(me: Session, claim: Pick<Claim, "id" | "status">): Promise<Got<Arrived> | null> {
  if (!ARRIVES.includes(claim.status)) return null;
  if (!(await stockCampuses(me.email))?.length) return null; // the frame's own question, asked once for the request
  try {
    const res = await engineSend("/stock/arrived", { actor: me.email, id: claim.id });
    return res.ok ? { ok: true, value: (await res.json()) as Arrived } : { ok: false, words: await said(res) };
  } catch (e) {
    if (e instanceof EngineDown) return { ok: false, words: e.message };
    throw e;
  }
}
