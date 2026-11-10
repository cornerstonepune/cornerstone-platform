import Link from "@/components/link";
import { ICON_SIZE, Icon, type IconName } from "@/lib/icons";
import { KindTile, type Kind } from "./kind-tile";
import { STATES, StatusChip, type State, type Tone } from "./status-chip";

export type KCard = { key: string; kind: Kind; title: string; sub: string; href: string; state: State; note?: string };
export type Lane = { key: string; label: string; state: State; count: number; empty: string; cards: readonly KCard[] };
export type View = { key: string; label: string; icon: IconName; href: string };

// The lane's colour is its state's tone, named as the other blocks name it (data-state): act is the red one, "late".
const LOOK: Record<Tone, string> = { ok: "ok", wait: "wait", act: "late", quiet: "quiet" };

/** What moves through stages: one lane per stage, each headed by its state's icon, word and count; each card a link (kind
 *  tile, one line, one fact, a state chip). A lane with no card says so in words. The lanes scroll sideways in their own box. */
export function KanbanBoard({ lanes }: { lanes: readonly Lane[] }) {
  return (
    <div data-block="KanbanBoard" className="b-kanban" style={{ ["--lanes" as string]: lanes.length }}>
      {lanes.map((l) => {
        const s = STATES[l.state];
        return (
          <section key={l.key} className="b-lane" data-state={LOOK[s.tone]} data-lane={l.key} aria-label={l.label}>
            <h3 className="b-lane-h">
              <Icon name={s.icon} size={ICON_SIZE.table} />
              {l.label}
              <span className="b-count b-num">{l.count}</span>
            </h3>
            {l.cards.length ? (
              <ul className="b-lane-b">
                {l.cards.map((c) => (
                  <li key={c.key}>
                    <Link href={c.href} className="b-kcard" data-kind={c.kind} data-press="">
                      <KindTile kind={c.kind} />
                      <span>
                        <b>{c.title}</b>
                        <span className="b-sub">{c.sub}</span>
                      </span>
                      <StatusChip state={c.state} note={c.note} compact round />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="b-lane-empty">{l.empty}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** The Table | Board toggle: segmented tabs, each a link, so the address carries the tab. */
export function ViewToggle({ views, current }: { views: readonly View[]; current: string }) {
  return (
    <div className="b-seg" role="tablist" aria-label="View">
      {views.map((v) => (
        <Link key={v.key} role="tab" aria-selected={v.key === current} href={v.href}>
          <Icon name={v.icon} size={ICON_SIZE.table} />
          {v.label}
        </Link>
      ))}
    </div>
  );
}
