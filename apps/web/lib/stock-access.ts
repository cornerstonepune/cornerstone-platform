import { cache } from "react";
import { EngineDown, engineSendWithin } from "./engine";

// Who keeps a store (CP-82, specs/CP-82/spec.md): the engine's `POST /stock/access` names the campuses the person keeps (an operations lead their own,
// a coordinator or a founder every campus) and, for a keeper, the words a reason may take. None, and the person has no Stock line and no Stock page. The frame
// asks on every page, so the wait is short: an engine that does not answer in time draws no Stock line (null), and a Stock page then says so in words
// instead of calling the person a non-keeper.
const WAIT_MS = 3_000;

export type StockAccess = { campuses: string[]; reasons?: { count: string[]; writeoff: string[] } };

/** What this person keeps and may say, once per request: no campuses keeps no store; `null` the engine could not say. */
export const stockAccess = cache(async (email: string): Promise<StockAccess | null> => {
  try {
    const res = await engineSendWithin("/stock/access", { actor: email }, WAIT_MS);
    return res.ok ? ((await res.json()) as StockAccess) : null;
  } catch (e) {
    if (e instanceof EngineDown) return null;
    throw e;
  }
});

/** The campuses this person keeps: `[]` keeps no store; `null` the engine could not say. */
export const stockCampuses = async (email: string): Promise<string[] | null> => (await stockAccess(email))?.campuses ?? null;

/** The campus a page shows: the one the address names if the person keeps it, else the first they keep. */
export const campusOf = (kept: readonly string[], asked: string | undefined): string => (asked && kept.includes(asked) ? asked : kept[0]);
