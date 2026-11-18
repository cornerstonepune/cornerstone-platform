"use client";

import { useEffect, useRef } from "react";
import { LessonPicker } from "@/components/lesson-picker";
import { Icon } from "@/lib/icons";
import type { AtPlace } from "../picker-actions";

// A place in the Build grid, opened (CP-74). A pattern has no dates and an objective belongs to a dated lesson, so the panel says which
// lesson it is choosing for: the next published lesson at this place. While the fortnight ahead is not published there is no lesson yet:
// the panel then only reads what is next up for the class in this subject, and says how to choose (decision recorded in docs/notes/CP-74.md).
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" });

export type Opened = { key: string; words: string; got: AtPlace | null };

export function PlaceLesson({ opened, next, onClose }: { opened: Opened; next: number | null; onClose: () => void }) {
  const { got } = opened;
  // Escape closes it from wherever the focus is (a button that has just been pressed and is now off holds none); a field being typed in
  // keeps its own keys. The newest `onClose` is the one called.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || (e.target instanceof HTMLElement && e.target.closest("input:not([type=radio]), select, textarea"))) return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="bd-side-body" data-place-lesson={opened.key}>
      <div className="lp-side-head">
        <h2 tabIndex={-1} data-place-title>{opened.words}</h2>
        <button type="button" className="bd-x" onClick={onClose} aria-label="Back to check and rules" title="Back to check and rules (Esc)" data-place-close>
          <Icon name="close" size={20} />
        </button>
      </div>
      {!got ? (
        <p className="b-muted b-label" role="status">Reading the lesson…</p>
      ) : got.lesson ? (
        got.offers.ok ? (
          <LessonPicker key={got.lesson.id} offers={got.offers.data} when={`${day(got.lesson.day)} · Fortnight ${got.lesson.fortnight}`} coordinator onSkip={onClose} />
        ) : (
          <p className="bd-check-why" role="alert">{got.offers.why}</p>
        )
      ) : (
        <div className="lp-ahead" data-place-unpublished>
          <h3 className="lp-h">Next up for this place</h3>
          <p data-place-next>
            {got.next?.ok
              ? got.next.data.next_up
                ? got.next.data.next_up.title
                : got.next.data.ordered
                  ? "Nothing is next yet: no lesson of this subject has an objective so far."
                  : "This subject's order is not checked yet, so nothing is marked as next."
              : "No lesson of this subject has been published for this class yet, so nothing is next."}
          </p>
          <p className="lp-note" data-place-how>
            {next ? "Publish this fortnight to choose, or let the picker suggest for you." : "No lesson is published at this place from today on."}
          </p>
        </div>
      )}
    </div>
  );
}
