import Link from "@/components/link";
import { ICON_SIZE, Icon } from "@/lib/icons";
import { STATES, type State } from "./status-chip";

/** `href`: where the tile opens; null when it opens nothing (no rows behind it, or the page it would open is not built): the tile is then not a link. */
export type Attention = { state: State; n: number; sentence: string; href: string | null };
const LOOK = { ok: "ok", wait: "wait", act: "late", quiet: "quiet" } as const;

/** Three tiles filled with their state's tint: do now (red), this week (amber), done (green); number, icon and word, one
 *  sentence; each a link. No border, no shadow. */
export function AttentionStrip({ tiles }: { tiles: readonly Attention[] }) {
  return (
    <div data-block="AttentionStrip" className="b-strip">
      {tiles.map((t) => {
        const body = (
          <>
            <span className="b-n">{t.n}</span>
            <span className="b-w">
              <Icon name={STATES[t.state].icon} size={ICON_SIZE.table} />
              {STATES[t.state].words}
            </span>
            <span className="b-muted">{t.sentence}</span>
          </>
        );
        return t.href ? (
          <Link key={t.state} href={t.href} className="b-att" data-state={LOOK[STATES[t.state].tone]} data-press>
            {body}
          </Link>
        ) : (
          <div key={t.state} className="b-att" data-state={LOOK[STATES[t.state].tone]}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
