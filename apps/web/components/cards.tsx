import type { ComponentProps, ElementType, ReactNode } from "react";
import { KindTile, type Kind } from "./kind-tile";
import Link from "./link";
import { StatusChip, type State } from "./status-chip";

/** The one box of the site (CP-68b). Every surface with an edge is this: a hairline border, the card radius, and its own inner padding,
 *  so text never sits against an edge. Its look is the `.card` rule in components/blocks.css and nowhere else
 *  (packages/engine/tests/test_design_scale.py fails a box drawn by hand).
 *
 *  - `compact`: a row (a period, a list line): the same box with less height.
 *  - `flush`: no padding, for the one thing that may reach a card's edge: a table, a picture or a scrolling area that is its whole content.
 *  - `tone`: `quiet` is a tinted ground with no border (a lane, a key, a message); `dashed` is a place where nothing is yet.
 *  - `href`, or `as="button"` / `as="label"`: a card that is pressed lifts under a fine pointer and gives way on press.
 *
 *  A card is never put flush inside a card: a card inside another keeps the outer one's padding around it and loses its own lift. */
export type CardTone = "quiet" | "dashed";
type Own = { compact?: boolean; flush?: boolean; tone?: CardTone; className?: string; children?: ReactNode };
type Tag = "div" | "article" | "section" | "aside" | "li" | "p" | "figure" | "details" | "form" | "label" | "button" | "dialog" | "ul" | "ol";
export type CardProps<T extends Tag = "div"> = Own & { as?: T; href?: undefined } & Omit<ComponentProps<T>, keyof Own | "as">;
type LinkCardProps = Own & { href: string; as?: undefined } & Omit<ComponentProps<typeof Link>, keyof Own | "href">;

const PRESSED: ReadonlySet<string> = new Set(["button", "label"]);

export function Card<T extends Tag = "div">(props: CardProps<T> | LinkCardProps) {
  const { compact, flush, tone, className, children, as, href, ...rest } = props as Own & { as?: Tag; href?: string } & Record<string, unknown>;
  const look = {
    className: className ? `card ${className}` : "card",
    "data-card": "",
    "data-compact": compact ? "" : undefined,
    "data-flush": flush ? "" : undefined,
    "data-tone": tone,
  };
  if (href !== undefined)
    return (
      <Link href={href} {...rest} {...look} data-press="">
        {children}
      </Link>
    );
  const As: ElementType = as ?? "div";
  return (
    <As {...rest} {...look} data-press={PRESSED.has(As as string) ? "" : undefined}>
      {children}
    </As>
  );
}

/** Two to three cards side by side, each with its kind's tile and title, a few lines and one link. A card may hold more than a line
 *  (`body`: a picture, a short table) and may have no link when it only shows.
 *  At most two chips (docs/frontend/page-charter.md A3): one `status` and one `count`, and no other way to put a chip on a card, so a
 *  third does not compile; everything else belongs in the detail panel. A count is a whole number. */
export type CardOf = { kind: Kind; title: string; line?: string; body?: ReactNode; href?: string; link?: string; primary?: boolean; status?: { state: State; words?: string }; count?: { n: number; words: string } };
export const CARD_CHIPS_MAX = 2;

function Chips({ c }: { c: CardOf }) {
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

export function Cards({ cards }: { cards: readonly CardOf[] }) {
  return (
    <div data-block="Cards" className="b-cards">
      {cards.slice(0, 3).map((c) => (
        <Card as="article" key={c.title} className="b-card" data-kind={c.kind}>
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
        </Card>
      ))}
    </div>
  );
}
