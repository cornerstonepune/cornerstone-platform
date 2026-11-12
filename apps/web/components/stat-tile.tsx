import Link from "@/components/link";
import type { Tone } from "./status-chip";

// StatTile (docs/frontend/page-charter.md A3): a number that matters on a page, big, with one line saying what it counts. Never a sentence
// with a number in it. Whole counts only: a figure that is not a whole count is a mistake of the page that passes it, and fails loudly here
// rather than showing "2.5 lessons". `tone` colours its edge on the one state scale; `href` opens what it counts.
export type Stat = { n: number; line: string; tone?: Tone; href?: string; id?: string };
const LOOK: Record<Tone, string> = { ok: "ok", wait: "wait", act: "late", quiet: "quiet" };

export function StatTile({ n, line, tone, href, id }: Stat) {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`a stat tile shows a whole count, not ${n}`);
  const body = (
    <>
      <b className="b-stat-n b-num">{n.toLocaleString("en-IN")}</b>
      <span className="b-stat-l">{line}</span>
    </>
  );
  const attrs = { "data-stat": id ?? line, "data-state": tone ? LOOK[tone] : undefined, className: "b-stat" };
  return href ? (
    <Link href={href} data-block="StatTile" {...attrs}>
      {body}
    </Link>
  ) : (
    <div data-block="StatTile" {...attrs}>{body}</div>
  );
}

/** A row of three or four tiles: a page's summary, or the right panel's when nothing is chosen. */
export function StatTiles({ label, stats }: { label: string; stats: readonly Stat[] }) {
  return (
    <ul data-block="StatTiles" aria-label={label} className="b-stats">
      {stats.map((s) => (
        <li key={s.id ?? s.line}>
          <StatTile {...s} />
        </li>
      ))}
    </ul>
  );
}
