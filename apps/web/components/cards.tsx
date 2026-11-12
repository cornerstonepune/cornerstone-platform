import { KindTile, type Kind } from "./kind-tile";
import { StatusChip, type State } from "./status-chip";

/** Two to three panels side by side, each with a header tinted in its kind's colour (kind tile and title), a few lines and
 *  one link. A card may hold more than a line (`body`: a picture, a short table) and may have no link when it only shows.
 *  At most two chips (docs/frontend/page-charter.md A3): one `status` and one `count`, and no other way to put a chip on a card, so a
 *  third does not compile; everything else belongs in the detail panel. A count is a whole number. */
export type Card = { kind: Kind; title: string; line?: string; body?: React.ReactNode; href?: string; link?: string; primary?: boolean; status?: { state: State; words?: string }; count?: { n: number; words: string } };
export const CARD_CHIPS_MAX = 2;

function Chips({ c }: { c: Card }) {
  if (!c.status && !c.count) return null;
  if (c.count && (!Number.isInteger(c.count.n) || c.count.n < 0)) throw new RangeError(`a card counts whole things, not ${c.count.n}`);
  return (
    <span className="b-card-chips" data-chips>
      {c.status ? <StatusChip state={c.status.state} words={c.status.words} compact round /> : null}
      {c.count ? (
        <span className="b-count b-num" data-count-chip>
          {c.count.n.toLocaleString("en-IN")} {c.count.words}
        </span>
      ) : null}
    </span>
  );
}

export function Cards({ cards }: { cards: readonly Card[] }) {
  return (
    <div data-block="Cards" className="b-cards">
      {cards.slice(0, 3).map((c) => (
        <article key={c.title} className="b-card" data-kind={c.kind}>
          <div className="b-card-h">
            <KindTile kind={c.kind} />
            {c.title}
            <Chips c={c} />
          </div>
          <div className="b-card-b">
            {c.line ? <span className="b-muted">{c.line}</span> : null}
            {c.body}
            {c.href && c.link ? c.primary ? <a href={c.href} className="btn" data-ux="action">{c.link}</a> : <a href={c.href}>{c.link}</a> : null}
          </div>
        </article>
      ))}
    </div>
  );
}
