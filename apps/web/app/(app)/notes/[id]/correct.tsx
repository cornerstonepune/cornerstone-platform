"use client";

import { useState, useTransition } from "react";
import { correctMark } from "../actions";

// Correct this note (a confirmed note only): one child's mark, a new mark, and why. The engine writes a new row that replaces the
// first; the first is never edited.
export type Mark = { observation: string; no: string; outcome: string };
const OUTCOMES: [string, string][] = [["above", "Above"], ["as_expected", "As expected"], ["below", "Below"], ["not_willing", "Not willing"], ["absent", "Absent"]];

export function Correct({ marks, back }: { marks: Mark[]; back: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const [pending, go] = useTransition();
  if (!marks.length) return null;
  return (
    <form
      data-correct
      className="panel mt-4 grid max-w-xl gap-3 p-4"
      action={(f) => {
        setSaid(null);
        go(async () => {
          const out = await correctMark(f);
          if (out?.error) setSaid(out.error);
        });
      }}
    >
      <input type="hidden" name="back" value={back} />
      <label className="grid gap-1 text-[14px]">
        Child
        <select name="observation" className="select" required>
          {marks.map((m) => (
            <option key={m.observation} value={m.observation}>
              {m.no} · {OUTCOMES.find(([k]) => k === m.outcome)?.[1] ?? m.outcome}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[14px]">
        New mark
        <select name="outcome" className="select" required defaultValue={OUTCOMES.find(([k]) => k !== marks[0].outcome)?.[0]}>
          {OUTCOMES.map(([k, w]) => (
            <option key={k} value={k}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[14px]">
        Why
        <input name="reason" className="input" required maxLength={300} />
      </label>
      <button type="submit" className="btn w-fit" disabled={pending}>
        Correct this note
      </button>
      {said ? (
        <p role="alert" className="text-[14px] text-terracotta">
          {said}
        </p>
      ) : null}
    </form>
  );
}
