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
import { SaidError } from "./said-error";
import { Card } from "@/components/cards";

// The lesson's class as a grid of child cards (page charter B4, CP-49, CP-88): Sr. No. and first name, each card in the colour of the level the
// child showed today (grey until marked; never red). One way to choose: a tap on a card picks the child (a tick and the accent's ring), a tap
// again lets go, any number; then ONE bar offers the activity's own four levels in its own words ("Not written" where it has none, nothing
// invented), Absent and Not willing, and a choice marks every picked child in one save. "Mark the rest at level n" marks every child not yet
// marked in one save; a child already marked keeps their level (CP-49 founder's rule: she marks only the children who stood out; once she has
// marked one, every present child she leaves is taken as Level 2). No name goes into a log or to the engine: a mark carries the child's id only.
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
  // children taken at the default level (the engine's `by_default`), not marked by her: still hers to mark
  const [taken, setTaken] = useState<ReadonlySet<string>>(() => new Set(kids.filter((c) => saved.some((m) => m.child_id === c.id && m.by_default)).map((c) => c.roll)));
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
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
    const w = l === undefined ? "Not marked" : taken.has(c.roll) ? `${words(l)} (as expected)` : words(l);
    return { key: c.roll, no: `#${c.roll}`, initials: c.initials, name: c.first, look, icon, words: w, label: `#${c.roll} ${c.first}: ${w}`, selected: ticked.has(c.roll), attrs: { "data-roll": c.roll, ...(l === undefined ? {} : { "data-level": String(l) }) } };
  };
  const unmarked = kids.filter((c) => marks[c.roll] === undefined || taken.has(c.roll)).map((c) => c.roll);
  // some children (`rolls` and `l`), or every child not yet marked at `rest`: one save either way
  const save = (next: { rolls: readonly string[]; l: Level } | { rest: number }, back?: string) =>
    go(async () => {
      const before = { marks, taken };
      setSaid(null);
      const chosen = "rolls" in next ? kids.filter((c) => next.rolls.includes(c.roll)) : [];
      const sent = "rolls" in next ? chosen.map((c) => toMark(c.id, next.l)) : [];
      const restAt = "rest" in next ? next.rest : undefined;
      const set = "rolls" in next ? next.rolls : unmarked;
      setMarks({ ...marks, ...Object.fromEntries(set.map((r) => [r, "rolls" in next ? next.l : next.rest])) });
      setTaken(new Set([...taken].filter((r) => !set.includes(r))));
      setTicked(new Set());
      const out = await saveLessonLevels(sessionId, classId, day, sent, count, restAt);
      if ("error" in out) {
        setMarks(before.marks);
        setTaken(before.taken);
      }
      setSaid(out);
      if (back) grid.current?.querySelector<HTMLElement>(`[data-roll="${back}"]`)?.focus();
    });
  // a tap picks a child or lets go of one; the picked children are the ones the next level is for
  const tap = (roll: string) =>
    setTicked((t) => {
      const next = new Set(t);
      if (!next.delete(roll)) next.add(roll);
      return next;
    });
  const firstTicked = () => kids.find((c) => ticked.has(c.roll))?.roll;
  const clear = () => {
    const back = firstTicked();
    setTicked(new Set());
    if (back) grid.current?.querySelector<HTMLElement>(`[data-roll="${back}"]`)?.focus();
  };
  return (
    // a flex column, not a grid: the bar below sticks to the foot of the screen, and a grid item may not leave its own cell
    <section className="flex flex-col gap-3" aria-label="Mark the class" data-child-levels onKeyDown={(e) => e.key === "Escape" && ticked.size && clear()}>
      <h2 className="text-body">Mark the class</h2>
      <p className="text-[length:var(--text-label)] text-[var(--ink-muted)]" data-default-level>
        Children you don&apos;t mark are taken as Level 2 (as expected).
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[length:var(--text-label)] text-[var(--ink-muted)]" data-select-hint>
          Tap the children, then choose the level they showed.
        </p>
        <button type="button" className="chip" disabled={!unmarked.length} onClick={() => setTicked(new Set(unmarked))} data-select-unmarked>
          Select all unmarked
        </button>
      </div>
      <div ref={grid} className="grid gap-3">
        <ClassGrid label={`${klass}, by Sr. No.`} onTap={tap} cells={kids.map(cell)} />
      </div>
      {ticked.size ? (
        <Card data-block="LevelPicker" className="b-selbar" role="group" aria-label={`Level for ${ticked.size} selected`} data-level-picker="ticked" data-picker>
          <div className="b-selbar-head">
            <p role="status" className="b-num" data-selected-count>
              {ticked.size} selected
            </p>
            <button type="button" className="chip" onClick={clear} data-clear-selection>
              Clear
            </button>
          </div>
          <ol className="b-selbar-levels">
            {levels.map((_, n) => (
              <li key={n}>
                <Card as="button" type="button" compact tone="quiet" className="b-level" data-state={levelLook(n, count)} data-choose-level={n} disabled={pending} title={words(n)} onClick={() => save({ rolls: [...ticked], l: n }, firstTicked())}>
                  <b className="b-num">{n}</b>
                  <span>{levels[n] || NOT_WRITTEN}</span>
                </Card>
              </li>
            ))}
            {OTHER.map((m) => (
              <li key={m}>
                <Card as="button" type="button" compact tone="quiet" className="b-level" data-state="quiet" data-choose-level={m} disabled={pending} onClick={() => save({ rolls: [...ticked], l: m }, firstTicked())}>
                  <Icon name={MARK_ICON[m]} />
                  <span>{W.marks[m]}</span>
                </Card>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
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
      {said?.error ? <SaidError>{said.error}</SaidError> : null}
      {said?.done ? <p role="status" className="text-[length:var(--text-label)] text-[var(--ink-muted)]" data-saved>{said.done}</p> : null}
      {said?.note ? <p className="text-[length:var(--text-label)] text-[var(--ink-muted)]" data-no-skill>{said.note}</p> : null}
    </section>
  );
}
