import { KindTile, type Kind } from "./kind-tile";

/** Two to three panels side by side, each with a header tinted in its kind's colour (kind tile and title), a few lines and
 *  one link. A card may hold more than a line (`body`: a picture, a short table) and may have no link when it only shows. */
export type Card = { kind: Kind; title: string; line?: string; body?: React.ReactNode; href?: string; link?: string; primary?: boolean };
export function Cards({ cards }: { cards: readonly Card[] }) {
  return (
    <div data-block="Cards" className="b-cards">
      {cards.slice(0, 3).map((c) => (
        <article key={c.title} className="b-card" data-kind={c.kind}>
          <div className="b-card-h">
            <KindTile kind={c.kind} />
            {c.title}
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
