import { EngineDown, engineGet } from "@/lib/engine";

// What the engine says about one scan, for the paper screen's answer panel. The engine down is not the page down: nothing is offered then.

/** A wrong answer no named mistake explains, with Jev's shortlist and every named mistake of its operation (`GET /capture/{id}/mistakes`, ADR 0036). */
export type Unnamed = { answer: string; shortlist: [string, number][]; options: string[]; why: string };
/** The right answer as the engine stores it, and who changed it from what (`GET /capture/{id}/keys`, ADR 0045). */
export type Key = { right: string; was: string | null; by: string | null; at: string | null };
/** Whose paper a page is (`GET /capture/{id}/proof`, w3_read/whose_paper.py): the screen shows it and decides nothing. */
export type Proof = {
  scan: string;
  copy: number | null;
  copies: number | null;
  page: number;
  pages: number;
  code: string | null;
  printed_with: string;
  problem: { kind: string; text: string } | null;
  choice: "theirs" | "not_theirs" | null;
  chosen_by: string | null;
  may_confirm: boolean;
};

async function read<T>(path: Parameters<typeof engineGet>[0], none: T): Promise<T> {
  try {
    const res = await engineGet(path);
    return res.ok ? ((await res.json()) as T) : none;
  } catch (e) {
    if (e instanceof EngineDown) return none;
    throw e;
  }
}

export const unnamedOn = (capture: string) => read<Record<string, Unnamed>>(`/capture/${capture}/mistakes`, {});
export const keysOn = (capture: string) => read<Record<string, Key>>(`/capture/${capture}/keys`, {});
export const proofOf = (capture: string, page: number) => read<Proof | undefined>(`/capture/${capture}/proof?page=${page}`, undefined);

/** Which pages of a scan the engine found a photograph of, and in words why not (`GET /capture/{id}/pages`): a page that is another page again is never drawn as its own. */
type PageFound = { page: number; found: boolean; said: string | null };
export const pageLost = async (capture: string, page: number): Promise<string | undefined> =>
  (await read<PageFound[]>(`/capture/${capture}/pages`, [])).find((p) => p.page === page && !p.found)?.said ?? undefined;
