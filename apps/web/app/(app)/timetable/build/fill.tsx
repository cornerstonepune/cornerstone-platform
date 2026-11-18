"use client";

import { useEffect, useRef } from "react";
import type { Pattern, PatternCell } from "@/lib/timetable-build";
import type { Edit, FillAnswer } from "./actions";

// Fill it in for me (CP-75, design E4 and F7): the engine's answer shown as a suggestion over the grid. Nothing is saved until the
// coordinator presses "Use this"; "Discard" leaves the timetable exactly as it was. When nothing fits, the engine's own sentences say
// which rule would have to give. The words are the engine's; this only lays them out.
export type Filling = { at: "idle" } | { at: "working" } | { at: "preview"; answer: FillAnswer; view: Pattern; fresh: Set<string> } | { at: "told"; answer: FillAnswer };

const key = (c: { week: string; period_id: string; weekday: number }) => `${c.week}:${c.period_id}:${c.weekday}`;

/** The pattern as it would be with the answer's edits, and which places would change (`week:period:weekday`). */
export function previewOf(pattern: Pattern, edits: Edit[]): { view: Pattern; fresh: Set<string> } {
  const at = new Map(pattern.cells.map((c) => [key(c), c]));
  const fresh = new Set<string>();
  for (const e of edits as (Edit & PatternCell & { op: "set" | "clear" })[]) {
    const k = key(e);
    const was = at.get(k);
    if (!was) continue;
    if (e.op === "set") {
      at.set(k, { ...was, cell: e.cell, subject_code: e.subject_code, text: e.text, source: "machine" });
      fresh.add(k);
    } else at.set(k, { ...was, cell: "empty", subject_code: null, text: "", source: null });
  }
  return { view: { ...pattern, cells: pattern.cells.map((c) => at.get(key(c)) ?? c) }, fresh };
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function FillBar({ fill, classId, busy, onUse, onDiscard }: { fill: Filling; classId: string; busy: boolean; onUse: () => void; onDiscard: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const shown = fill.at === "preview" || fill.at === "told";
  useEffect(() => {
    if (shown) box.current?.focus(); // the person pressed a button and the answer is here: a keyboard and a screen reader land on it
  }, [shown]);
  if (fill.at !== "preview" && fill.at !== "told") return null;
  const a = fill.answer;
  const mine = a.classes.find((c) => c.class_id === classId);
  const lines = [...a.rules.map((r) => r.sentence), ...(fill.at === "preview" ? a.problems.map((p) => p.sentence) : [])];
  const head =
    fill.at === "preview"
      ? "A suggestion. Nothing is saved yet."
      : a.outcome === "unmeetable"
        ? "This cannot be filled in as the rules stand."
        : a.outcome === "placed"
          ? "There is nothing to place."
          : (a.sentence ?? "No timetable was found.");
  const body =
    fill.at === "preview" && mine
      ? `${count(mine.set, "lesson", "lessons")} placed${mine.cleared ? `, ${count(mine.cleared, "machine-made lesson", "machine-made lessons")} moved or taken out` : ""}. New lessons are outlined, in both weeks. Every lesson a person placed is where it was.`
      : a.outcome === "placed"
        ? "Fill it in for me places each subject's “at least” from the Rules. Every subject already has that many, or no subject has a count yet."
        : null;
  return (
    <div ref={box} tabIndex={-1} role="region" aria-label="Fill it in for me" className="bd-fill" data-fill-bar={fill.at === "preview" ? "preview" : a.outcome}>
      <p className="bd-fill-head">{head}</p>
      {body ? <p className="bd-fill-body">{body}</p> : null}
      {lines.length ? (
        <ul className="bd-fill-lines">
          {lines.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : null}
      {a.notes.length ? (
        <ul className="bd-fill-notes b-muted">
          {a.notes.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : null}
      <div className="bd-fill-ends">
        {fill.at === "preview" ? (
          <>
            <button type="button" className="btn secondary" onClick={onUse} disabled={busy} data-fill-use>Use this</button>
            <button type="button" className="btn tertiary" onClick={onDiscard} disabled={busy} data-fill-discard>Discard</button>
          </>
        ) : (
          <button type="button" className="btn secondary" onClick={onDiscard} data-fill-close>Close</button>
        )}
      </div>
    </div>
  );
}
