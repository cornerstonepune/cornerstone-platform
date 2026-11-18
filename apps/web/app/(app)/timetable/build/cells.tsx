"use client";

import type { CSSProperties, RefObject } from "react";
import { Card } from "@/components/cards";
import { ICON_SIZE, Icon } from "@/lib/icons";
import type { Pattern, PatternCell } from "@/lib/timetable-build";
import type { Head } from "@/lib/timetable-palette";

// The builder's week grid (CP-71, wireframe 2): periods down, Monday to Friday across, each lesson a cell that is pressed to paint it. A fixed
// row is a band and is never painted. A lesson in a problem carries an icon in its corner (never colour alone) and says so to a screen
// reader; the lessons of the problem being pointed at in the panel are ringed.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export type Mark = "must" | "try";

export function PatternGrid({
  box,
  pattern,
  week,
  palette,
  marks,
  flagged,
  fresh,
  opened,
  canFill,
  onPaint,
  onFill,
}: {
  box: RefObject<HTMLDivElement | null>;
  pattern: Pattern;
  week: "A" | "B";
  palette: Head[];
  /** `week:period:weekday` of each lesson in an open problem, and how bad. */
  marks: Map<string, Mark>;
  flagged: Set<string>;
  /** Places a suggestion would newly fill (Fill it in for me): outlined and tagged until it is used or discarded. */
  fresh?: Set<string>;
  /** `week:period:weekday` of the lesson open in the panel. */
  opened?: string;
  canFill: boolean;
  onPaint: (periodId: string, weekday: number) => void;
  onFill: (periodId: string) => void;
}) {
  const at = new Map<string, PatternCell>(pattern.cells.filter((c) => c.week === week).map((c) => [`${c.period_id}:${c.weekday}`, c]));
  const head = (code: string | null) => palette.find((h) => h.code === code);
  return (
    <div className="b-fgrid-box">
      <div className="b-fweek" ref={box}>
        <div className="b-fgrid" style={{ "--cols": 5 } as CSSProperties}>
          <span />
          {DAYS.map((d) => (
            <span key={d} className="b-dh">
              <span className="b-dh-wd">{d}</span>
            </span>
          ))}
          {pattern.periods.map((p) => {
            if (p.fixed)
              return (
                <Card key={p.id} compact tone="quiet" className="b-band">
                  <span className="b-band-tm">{p.starts_at}</span>
                  <span className="b-band-body">
                    <Icon name="break" size={ICON_SIZE.table} />
                    {at.get(`${p.id}:1`)?.text || p.label}
                  </span>
                </Card>
              );
            return [
              <span key={`${p.id}t`} className="b-tm">
                <span className="b-tm-start">
                  {p.starts_at}–{p.ends_at ?? ""}
                </span>{" "}
                <span className="b-tm-end">{p.label}</span>
                <button type="button" className="chip" disabled={!canFill} onClick={() => onFill(p.id)} data-fill={p.id} aria-label={`Fill ${p.label} every day`}>
                  Fill every day
                </button>
              </span>,
              ...[1, 2, 3, 4, 5].map((d) => {
                const c = at.get(`${p.id}:${d}`);
                const lesson = c && c.cell !== "empty" ? c : undefined;
                const h = lesson ? head(lesson.subject_code) : undefined;
                const where = `${week}:${p.id}:${d}`;
                const mark = marks.get(where);
                const isNew = !!fresh?.has(where);
                const trouble = mark === "must" ? ", has a problem to fix" : mark === "try" ? ", has something to look at" : "";
                return (
                  <Card
                    key={`${p.id}-${d}`}
                    as="button"
                    type="button"
                    compact
                    tone="quiet"
                    className="b-cell"
                    data-cell
                    data-period={p.id}
                    data-day={d}
                    data-subject={h?.look}
                    data-empty={lesson ? undefined : ""}
                    data-problem={mark}
                    data-flag={flagged.has(where) || opened === where ? "" : undefined}
                    data-opened={opened === where ? "" : undefined}
                    data-new={isNew ? "" : undefined}
                    aria-label={`${DAYS[d - 1]} ${p.label}: ${lesson ? lesson.text : "free"}${isNew ? ", suggested, not saved" : ""}${trouble}`}
                    disabled={c?.cell === "fixed"}
                    onClick={() => onPaint(p.id, d)}
                  >
                    {lesson ? (
                      <span className="b-subj">
                        {h ? <Icon name={h.look} size={ICON_SIZE.table} /> : null}
                        {lesson.text}
                        {isNew ? <span className="bd-new">new</span> : null}
                      </span>
                    ) : (
                      <span className="b-muted">Free</span>
                    )}
                    {mark ? (
                      <span className="bd-mark" data-level={mark}>
                        <Icon name={mark === "must" ? "fix-this" : "to-confirm"} size={ICON_SIZE.table} />
                      </span>
                    ) : null}
                  </Card>
                );
              }),
            ];
          })}
        </div>
      </div>
    </div>
  );
}
