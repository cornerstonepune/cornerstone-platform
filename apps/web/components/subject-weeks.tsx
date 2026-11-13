import Link from "@/components/link";
import type { Look } from "@/lib/subject-looks";
import { SubjectTag } from "./subject-tag";

// The two charts of Time by subject (docs/frontend/page-charter.md B3), each in the subject colours (A3: the school's own subject rows,
// lib/subject-looks.ts), never a colour alone: every segment carries its subject's word and minutes for a screen reader and on hover, and
// the table beside them says every number again.

export type Part = { code: string; words: string; look: Look; minutes: number };
export type WeekColumn = { week: string; label: string; parts: readonly Part[] };

const minutesWords = (m: number) => `${m.toLocaleString("en-IN")} min`;

/** One stacked column per week, its height its teaching minutes against the tallest week, a segment per subject in the same order every
 *  week. A segment opens that week's lessons of that subject (`href`); the open one is marked. A week with no lessons is an empty slot. */
export function WeekBars({ weeks, href, open }: { weeks: readonly WeekColumn[]; href: (week: string, code: string) => string; open?: string }) {
  const most = Math.max(1, ...weeks.map((w) => w.parts.reduce((t, p) => t + p.minutes, 0)));
  return (
    <figure data-chart="weeks" className="ts-weeks" aria-label="Teaching minutes by subject, a column per week">
      <ol className="ts-cols">
        {weeks.map((w) => {
          const total = w.parts.reduce((t, p) => t + p.minutes, 0);
          return (
            <li key={w.week} data-week={w.week} className="ts-col">
              <span className="ts-total b-num">{total ? total.toLocaleString("en-IN") : "–"}</span>
              <span className="ts-stack" style={{ "--h": total / most } as React.CSSProperties}>
                {w.parts
                  .filter((p) => p.minutes > 0)
                  .map((p) => {
                    const key = `${w.week}~${p.code}`;
                    const said = `${p.words}, week of ${w.label}: ${minutesWords(p.minutes)}`;
                    return (
                      <Link
                        key={p.code}
                        href={href(w.week, p.code)}
                        scroll={false}
                        className="ts-seg"
                        data-subject={p.look}
                        data-segment={key}
                        data-open-key={`period:${key}`}
                        aria-current={open === key ? "true" : undefined}
                        aria-label={said}
                        title={said}
                        style={{ "--n": p.minutes } as React.CSSProperties}
                      />
                    );
                  })}
              </span>
              <span className="ts-wk b-label b-muted">{w.label}</span>
            </li>
          );
        })}
      </ol>
      <figcaption className="b-label b-muted">Minutes taught each week; choose a part of a column to see those lessons.</figcaption>
    </figure>
  );
}

/** The whole range as one ring, a segment per subject (2 px apart), the total in the middle, and its key: each subject's word and share. */
export function SubjectDonut({ parts, total }: { parts: readonly (Part & { share: number })[]; total: number }) {
  const shown = parts.filter((p) => p.minutes > 0);
  if (!total || !shown.length) return null;
  const R = 15.9155; // a circle of circumference 100, so a share is its own dash length
  const GAP = shown.length > 1 ? 0.6 : 0;
  const lens = shown.map((p) => (100 * p.minutes) / total);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((t, l) => t + l, 0));
  return (
    <figure data-chart="donut" className="ts-donut">
      <svg viewBox="0 0 42 42" role="img" aria-label={shown.map((p) => `${p.words} ${p.share}%`).join(", ")}>
        <circle cx="21" cy="21" r={R} className="ts-ring" />
        {shown.map((p, i) => {
          const len = lens[i];
          return (
            <circle
              key={p.code}
              cx="21"
              cy="21"
              r={R}
              className="ts-arc"
              data-subject={p.look}
              data-arc={p.code}
              strokeDasharray={`${Math.max(0, len - GAP)} ${100 - Math.max(0, len - GAP)}`}
              strokeDashoffset={25 - starts[i]}
            >
              <title>{`${p.words}: ${minutesWords(p.minutes)}, ${p.share}%`}</title>
            </circle>
          );
        })}
        <text x="21" y="21" className="ts-mid b-num">
          {total.toLocaleString("en-IN")}
        </text>
        <text x="21" y="26" className="ts-mid-l">
          minutes
        </text>
      </svg>
      <figcaption>
        <ul className="ts-key">
          {shown.map((p) => (
            <li key={p.code}>
              <SubjectTag look={p.look} words={p.words} />
              <span className="b-num b-label">{p.share}%</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
