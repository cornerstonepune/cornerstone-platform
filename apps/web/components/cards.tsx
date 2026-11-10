import { KindTile, type Kind } from "./kind-tile";

/** Two to three panels side by side, each with a header tinted in its kind's colour (kind tile and title), a few lines and
 *  one link. */
export function Cards({ cards }: { cards: readonly { kind: Kind; title: string; line: string; href: string; link: string }[] }) {
  return (
    <div data-block="Cards" className="b-cards">
      {cards.slice(0, 3).map((c) => (
        <article key={c.title} className="b-card" data-kind={c.kind}>
          <div className="b-card-h">
            <KindTile kind={c.kind} />
            {c.title}
          </div>
          <div className="b-card-b">
            <span className="b-muted">{c.line}</span>
            <a href={c.href}>{c.link}</a>
          </div>
        </article>
      ))}
    </div>
  );
}
