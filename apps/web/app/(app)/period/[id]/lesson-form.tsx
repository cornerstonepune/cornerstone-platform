"use client";

import { useState, useTransition } from "react";
import { ClassGrid, type GridCell, type Look } from "@/components/class-grid";
import { Icon, MARK_ICON } from "@/lib/icons";
import { MARKS, type MarkKey, W } from "@/lib/voice-words";
import { saveLessonForm, type Filled } from "./actions";

// The lesson's own form (PR 3): the class as squares by Sr. No., a tap on a child picks what they showed (above, below, not willing,
// absent), "the rest did as expected" says the others, and the level expected is chosen with the activity's own four level words beside it.
// Save is the engine's `/voice/form` for this lesson: its activity and day are the lesson's. Nothing is ticked for her; a child left
// alone is the rest, and with the switch off, not seen. The engine decides what may be saved and its words come back here.
const LOOK: Record<MarkKey | "as_expected", Look> = { above: "ok", below: "wait", not_willing: "quiet", absent: "quiet", as_expected: "ok" };

export function LessonForm({ rolls, roster, levels, klass, sessionId, classId, day }: { rolls: string[]; roster?: Record<string, { name: string; initials: string }>; levels: string[]; klass: string; sessionId: string; classId: string; day: string }) {
  const [marks, setMarks] = useState<Record<string, MarkKey>>({});
  const [rest, setRest] = useState(true);
  const [level, setLevel] = useState<number | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [said, setSaid] = useState<{ error?: string; done?: string } | null>(null);
  const [pending, go] = useTransition();
  const cell = (roll: string): GridCell => {
    const m: MarkKey | "as_expected" | null = marks[roll] ?? (rest ? "as_expected" : null);
    const words = m ? W.marks[m] : W.notSeen;
    return { key: roll, no: `#${roll}`, initials: roster?.[roll]?.initials ?? "", name: roster?.[roll]?.name ?? "", look: m ? LOOK[m] : "unseen", icon: m ? MARK_ICON[m] : "not-seen", words, label: `#${roll}: ${words}`, attrs: { "data-roll": roll } };
  };
  const pick = (m: MarkKey | "clear") => {
    if (picking) {
      const next = { ...marks };
      if (m === "clear") delete next[picking];
      else next[picking] = m;
      setMarks(next);
    }
    setPicking(null);
  };
  const lists = (): Filled["lists"] => ({ above: [], below: [], not_willing: [], absent: [], ...Object.fromEntries(MARKS.map((m) => [m, Object.keys(marks).filter((r) => marks[r] === m)])) });
  const save = () =>
    go(async () => {
      setSaid(null);
      if (level === null) return setSaid({ error: "Choose the expected level." });
      const out = await saveLessonForm(sessionId, classId, day, { level, rest, lists: lists() });
      setSaid(out);
      if ("done" in out) setMarks({});
    });
  return (
    <section className="grid gap-3" aria-label="Mark the class for this lesson" data-lesson-form>
      <h2 className="text-[16px]">Mark the class for this lesson</h2>
      <ClassGrid label={`${klass}, by Sr. No.`} showName={!!roster} onTap={(roll) => setPicking(picking === roll ? null : roll)} cells={rolls.map(cell)} />
      {picking ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Mark #${picking}`} data-picker={picking} onKeyDown={(e) => e.key === "Escape" && setPicking(null)}>
          {([...MARKS, "clear"] as const).map((m) => (
            <button key={m} type="button" className="chip" data-pick={m} onClick={() => pick(m)}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name={MARK_ICON[m]} />
                {W.marks[m]}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[length:var(--text-label)] text-[var(--ink-muted)]">Tap a child to say what they showed.</p>
      )}
      <button type="button" role="switch" aria-checked={rest} onClick={() => setRest(!rest)} className={`chip w-fit ${rest ? "on" : ""}`} data-rest={rest}>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="as-expected" />
          {W.rest.label}: {rest ? W.rest.on : W.rest.off}
        </span>
      </button>
      <fieldset className="grid gap-2" data-levels>
        <legend className="mb-1 text-[13px] text-[var(--ink-muted)]">{W.level.label}</legend>
        {W.level.values.map((n) => (
          <label key={n} className="flex items-start gap-2 text-[14px]">
            <input type="radio" name="level" value={n} checked={level === n} onChange={() => setLevel(n)} className="mt-1" />
            <span>
              <b>{n}</b>
              {levels[n] ? <span className="text-[var(--ink-muted)]"> · {levels[n]}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={save} disabled={pending} data-save>
          Save the marks
        </button>
        {said?.error ? <p role="alert" className="rounded-[var(--radius-control)] border border-[var(--state-late)] bg-[var(--state-late-bg)] px-[var(--space-3)] py-[var(--space-2)] text-[var(--state-late)]">{said.error}</p> : null}
        {said?.done ? <p role="status" className="text-[length:var(--text-label)] text-[var(--ink-muted)]" data-saved>{said.done}</p> : null}
      </div>
    </section>
  );
}
