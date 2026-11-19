import { cache } from "react";
import { EngineDown, engineSendWithin } from "./engine";

// Who keeps a store (CP-82, specs/CP-82/spec.md): the engine's `POST /stock/access` names the campuses the person keeps (an operations lead their own,
// a coordinator or a founder every campus). None, and the person has no Stock line and no Stock page. The frame asks on every page, so the wait is short:
// an engine that does not answer in time draws no Stock line (null), and a Stock page then says so in words instead of calling the person a non-keeper.
const WAIT_MS = 3_000;

/** The campuses this person keeps, once per request: `[]` keeps no store; `null` the engine could not say. */
export const stockCampuses = cache(async (email: string): Promise<string[] | null> => {
  try {
    const res = await engineSendWithin("/stock/access", { actor: email }, WAIT_MS);
    return res.ok ? ((await res.json()) as { campuses: string[] }).campuses : null;
  } catch (e) {
    if (e instanceof EngineDown) return null;
    throw e;
  }
});

/** The campus a page shows: the one the address names if the person keeps it, else the first they keep. */
export const campusOf = (kept: readonly string[], asked: string | undefined): string => (asked && kept.includes(asked) ? asked : kept[0]);
