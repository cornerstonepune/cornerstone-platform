import { cache } from "react";
import { sql } from "./db";
import { PART_KEYS, PART_WORDS, type PartKey } from "./page-part";
import { screensGrade } from "./curriculum-screens";

// The curriculum's drafted parts as a board (docs/frontend/wireframes/curriculum.html): one card per activity in the lane its
// parts are in, with the parts named. Three lanes: a drafted part waits for a person; a part a person has written or changed is
// checked; a part nobody has written is empty. A part is in one lane; an activity with parts in two lanes is on both. The card's
// own words come from the part words (lib/page-part.ts), never typed here.

export type BoardLane = "toCheck" | "checked" | "empty";
export type BoardCard = { code: string; name: string; parts: string };
export type Board = Record<BoardLane, { count: number; cards: BoardCard[] }>;
const SHOWN = 5;

export const curriculumBoard = cache(async (): Promise<Board> => {
  const band = await screensGrade();
  const rows = await sql<{ code: string; name: string; part: PartKey; lane: BoardLane }[]>`
    select a.code, a.name, p.part,
           case when btrim(p.txt) = '' then 'empty'
                when s.source = 'drafted' then 'toCheck'
                when s.source = 'person' then 'checked' end as lane
    from activity a
    cross join lateral (values ('objective', a.objective), ('materials', a.materials), ('steps', a.steps), ('thinking', a.thinking), ('level_0', a.level_0), ('level_1', a.level_1), ('level_2', a.level_2), ('level_3', a.level_3)) as p(part, txt)
    left join activity_part_source s on s.tenant_id = a.tenant_id and s.activity_code = a.code and s.part = p.part
    where a.band = ${band} and (p.part <> 'materials' or btrim(p.txt) = '')
    order by a.code`;
  const board: Board = { toCheck: { count: 0, cards: [] }, checked: { count: 0, cards: [] }, empty: { count: 0, cards: [] } };
  const by = new Map<string, { name: string; parts: PartKey[] }>();
  for (const r of rows) {
    if (!r.lane) continue;
    const k = `${r.lane}:${r.code}`;
    by.set(k, { name: r.name, parts: [...(by.get(k)?.parts ?? []), r.part] });
  }
  for (const [k, v] of by) {
    const [lane, code] = [k.slice(0, k.indexOf(":")) as BoardLane, k.slice(k.indexOf(":") + 1)];
    board[lane].count += 1;
    if (board[lane].cards.length < SHOWN) {
      board[lane].cards.push({ code, name: v.name, parts: [...v.parts].sort((a, b) => PART_KEYS.indexOf(a) - PART_KEYS.indexOf(b)).map((p) => PART_WORDS[p]).join(" · ") });
    }
  }
  return board;
});
