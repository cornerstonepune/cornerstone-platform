// A number as a tile (docs/frontend/page-charter.md A3): a big number and one line, never a sentence. `tone` colours it on the one state
// scale (lib/scale.ts); a tile with no tone is plain. A tile that opens something is a link.
import Link from "@/components/link";
import type { Tone } from "@/lib/scale";

export type Tile = { n: number | string; label: string; tone?: Tone; href?: string };

export function StatTile({ n, label, tone, href }: Tile) {
  const body = (
    <>
      <b className="b-stat-n">{typeof n === "number" ? n.toLocaleString("en-IN") : n}</b>
      <span className="b-stat-l">{label}</span>
    </>
  );
  return href ? (
    <Link href={href} data-block="StatTile" data-state={tone} className="b-stat" data-press>
      {body}
    </Link>
  ) : (
    <div data-block="StatTile" data-state={tone} className="b-stat">
      {body}
    </div>
  );
}

/** The three or four numbers that matter on a page, side by side. */
export function StatTiles({ tiles, label = "Summary" }: { tiles: readonly Tile[]; label?: string }) {
  return (
    <section aria-label={label} data-stat-tiles className="b-stats">
      {tiles.slice(0, 4).map((t) => (
        <StatTile key={t.label} {...t} />
      ))}
    </section>
  );
}
