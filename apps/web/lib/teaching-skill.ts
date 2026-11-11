// What a registry skill asks and watches for, read from the skill sets (grades 1 to 4) that point at it (UI-3c): the kinds of question
// its questions come in and the mistakes they are built to notice. A skill may be covered by several sets; the counts add. Nothing is
// decided here: the bank's own rows are counted (lib/queries-skills.ts).
import { sql } from "./db";
import { skillKinds } from "./queries-skills";

export type KindCount = { fmt: string; n: number };

/** The kinds of question the skill's questions come in (counted from the bank) and the mistakes its skill sets name (`skill.misconception_codes`,
 *  read as codes: the words are the mistake book's). A count of the questions that catch each mistake would read the whole bank on every
 *  page, so none is made here. */
export async function whatItAsks(code: string): Promise<{ kinds: KindCount[]; mistakes: string[] }> {
  const sets = await sql<{ code: string }[]>`select code from skill where ${code} = any(registry_codes) order by code`;
  const [kinds, mistakes] = await Promise.all([
    Promise.all(sets.map((s) => skillKinds(s.code))),
    sql<{ code: string }[]>`select distinct m as code from skill, unnest(misconception_codes) m where ${code} = any(registry_codes) order by m`,
  ]);
  const n = new Map<string, number>();
  for (const k of kinds.flat()) n.set(k.fmt, (n.get(k.fmt) ?? 0) + k.n);
  return { kinds: [...n].map(([fmt, count]) => ({ fmt, n: count })).sort((a, b) => b.n - a.n || a.fmt.localeCompare(b.fmt)), mistakes: mistakes.map((m) => m.code) };
}
