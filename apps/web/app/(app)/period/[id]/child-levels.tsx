"use client";

import { useRef, useState, useTransition } from "react";
import { ClassGrid, type GridCell } from "@/components/class-grid";
import { rowOf } from "@/components/status-chip";
import type { ChildMark, MarkRead } from "@/lib/educator/data";
import type { MarkKey } from "@/lib/voice-words";
import { Icon, MARK_ICON } from "@/lib/icons";
import { levelLook, levelState } from "@/lib/state-scale";
import { W } from "@/lib/voice-words";
import { saveLessonLevels } from "./actions";

// The lesson's class as a grid of child cards (page charter B4, CP-49): Sr. No. and first name, each card in the colour of the level the child
// showed today (grey until marked; never red). A tap on a card opens the choices: the activity's own four levels in its own words ("Not written"
// where it has none, nothing invented), Absent and Not willing; a choice is saved at once. "Mark the rest at level n" marks every child not yet
// marked in one save; a child already marked keeps their level. No name goes into a log or to the engine: a mark carries the child's id only.
type Level = number | Extract<MarkKey, "absent" | "not_willing">;
const OTHER = ["absent", "not_willing"] as const satisfies readonly Level[];
const NOT_WRITTEN = "Not written";

export type Child = { roll: string; id: string; first: string; initials: string };

const levelOf = (m: MarkRead): Level | undefined => m.status ?? m.level ?? undefined;
const toMark = (id: string, l: Level): ChildMark => (typeof l === "number" ? { child_id: id, level: l } : { child_id: id, status: l });

export function ChildLevels({ sessionId, classId, day, klass, kids, levels, saved }: { sessionId: string; classId: string; day: string; klass: string; kids: readonly Child[]; levels: readonly string[]; saved: readonly MarkRead[] }) {
  // the marks by Sr. No., read back by child id
  const [marks, setMarks] = useState<Record<string, Level>>(() => {
    const byId = new Map(saved.flatMap((m) => (levelOf(m) === undefined ? [] : [[m.child_id, levelOf(m)!] as const])));
    return Object.fromEntries(kids.flatMap((c) => (byId.has(c.id) ? [[c.roll, byId.get(c.id)!]] : [])));
  });
  const [picking, setPicking] = useState<string | null>(null);
  const [rest, setRest] = useState(0);
  const [said, setSaid] = useState<{ error?: string; done?: string; note?: string } | null>(null);
  const [pending, go] = useTransition();
  const grid = useRef<HTMLDivElement>(null);
  const count = levels.length;
  const words = (l: Level) => (typeof l === "number" ? `${l} · ${levels[l] || NOT_WRITTEN}` : W.marks[l]);
  const cell = (c: Child): GridCell => {
    const l = marks[c.roll];
    const look = l === undefined ? "unseen" : typeof l === "number" ? levelLook(l, count) : "quiet";
    const icon = l === undefined ? "not-seen" : typeof l === "number" ? rowOf(levelState(l, count)).icon : MARK_ICON[l];
    const w = l === undefined ? "Not marked" : words(l);
    return { key: c.roll, no: `#${c.roll}`, initials: c.initials, name: c.first, look, icon, words: w, label: `#${c.roll} ${c.first}: ${w}`, attrs: { "data-roll": c.roll, ...(l === undefined ? {} : { "data-level": String(l) }) } };
  };
  const unmarked = kids.filter((c) => marks[c.roll] === undefined).map((c) => c.roll);
  // one child (`roll` and `l`), or every child not yet marked at `rest`: one save either way
  const save = (next: { roll: string; l: Level } | { rest: number }, back?: string) =>
    go(async () => {
      const before = marks;
      setSaid(null);
      const one = "roll" in next ? kids.find((c) => c.roll === next.roll) : undefined;
      const sent = one && "roll" in next ? [toMark(one.id, next.l)] : [];
      const restAt = "rest" in next ? next.rest : undefined;
      setMarks({ ...marks, ...("roll" in next ? { [next.roll]: next.l } : Object.fromEntries(unmarked.map((r) => [r, next.rest]))) });
      const out = await saveLessonLevels(sessionId, classId, day, sent, count, restAt);
      if ("error" in out) setMarks(before);
      setSaid(out);
      if (back) grid.current?.querySelector<HTMLElement>(`[data-roll="${back}"]`)?.focus();
    });
  const choose = (l: Level) => {
    const roll = picking;
    setPicking(null);
    if (roll) save({ roll, l }, roll);
  };
  const close = () => {
    const roll = picking;
    setPicking(null);
    if (roll) grid.current?.querySelector<HTMLElement>(`[data-roll="${roll}"]`)?.focus();
  };
  const tap = (roll: string) => {
    setPicking(picking === roll ? null : roll);
    // the choices come after the grid: they take the focus, so a keyboard (and a phone's screen) is taken to them
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>("[data-level-picker] button")?.focus());
  };
  const who = kids.find((c) => c.roll === picking);
  return (
    <section className="grid gap-3" aria-label="Mark the class" data-child-levels>
      <h2 className="text-[16px]">Mark the class</h2>
      <div ref={grid} className="grid gap-3">
        <ClassGrid label={`${klass}, by Sr. No.`} onTap={tap} cells={kids.map(cell)} />
        {who ? (
          <div data-block="LevelPicker" className="grid gap-2" role="group" aria-label={`Level for #${who.roll}`} data-level-picker={who.roll} data-picker onKeyDown={(e) => e.key === "Escape" && close()}>
            <p className="text-[length:var(--text-label)] text-[var(--ink-muted)]">#{who.roll} {who.first}: what did they show?</p>
            <ol className="b-levels">
              {levels.map((_, n) => (
                <li key={n}>
                  <button type="button" className="b-level w-full text-left" data-state={levelLook(n, count)} data-choose-level={n} aria-pressed={marks[who.roll] === n} onClick={() => choose(n)}>
                    <b className="b-num">{n}</b>
                    <span>{levels[n] || NOT_WRITTEN}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              {OTHER.map((m) => (
                <button key={m} type="button" className="chip" data-choose-level={m} aria-pressed={marks[who.roll] === m} onClick={() => choose(m)}>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name={MARK_ICON[m]} />
                    {W.marks[m]}
                  </span>
                </button>
              ))}
              <button type="button" className="chip" onClick={close}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[length:var(--text-label)] text-[var(--ink-muted)]">Tap a child to choose the level they showed.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2" data-mark-rest>
        <label className="flex items-center gap-2 text-[length:var(--text-label)] text-[var(--ink-muted)]">
          Level for the rest
          <select className="select" value={rest} onChange={(e) => setRest(Number(e.target.value))} name="rest-level">
            {levels.map((w, n) => (
              <option key={n} value={n}>
                {n} · {w || NOT_WRITTEN}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn secondary" disabled={pending || !unmarked.length} onClick={() => save({ rest })} data-rest-button>
          Mark the rest at level {rest}
        </button>
        <span className="text-[length:var(--text-label)] text-[var(--ink-muted)]" data-unmarked>
          {unmarked.length} not marked
        </span>
      </div>
      {said?.error ? <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--state-late)] bg-[var(--state-late-bg)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--state-late)]">{said.error}</p> : null}
      {said?.done ? <p role="status" className="text-[length:var(--text-label)] text-[var(--ink-muted)]" data-saved>{said.done}</p> : null}
      {said?.note ? <p className="text-[length:var(--text-label)] text-[var(--ink-muted)]" data-no-skill>{said.note}</p> : null}
    </section>
  );
}
