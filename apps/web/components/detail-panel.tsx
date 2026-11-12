import type { ReactNode } from "react";
import Link from "@/components/link";
import { PanelTabs, type PanelTab } from "./panel-tabs";
import { StatTiles, type Tile } from "./stat-tile";

// The right side of a page (docs/frontend/page-charter.md A2): the detail of the thing selected, in tabs, without leaving the page. The
// selection is in the address as `?open=<kind>:<id>`, so it can be sent as a link and opened as a full page (`full`); `close` is the
// address without it. With nothing selected the panel shows the page's own summary: its stat tiles, never a list of links to other pages
// (those are the sidebar's). A page offers the panel only where a selection has a detail to show.
export type Open = { kind: string; id: string };

/** `?open=lesson:abc` → { kind: "lesson", id: "abc" }; anything else is nothing selected. */
export function openOf(raw: string | undefined): Open | null {
  const m = /^([a-z][a-z-]*):(.+)$/.exec(raw ?? "");
  return m ? { kind: m[1], id: m[2] } : null;
}

export function DetailPanel({ open, title, subtitle, tabs, first, close, full, tiles, summaryLabel, actions }: {
  open: Open | null;
  title?: string;
  subtitle?: ReactNode;
  tabs?: readonly PanelTab[];
  first?: string;
  /** The page's address with the selection taken off. */
  close: string;
  /** The selected thing as a page of its own (for a link). */
  full?: string;
  /** What shows when nothing is selected. */
  tiles: readonly Tile[];
  summaryLabel?: string;
  /** Things to do with the selection (the coordinator's Move and Choose activity). */
  actions?: ReactNode;
}) {
  if (!open || !tabs?.length)
    return (
      <aside aria-label="Detail" data-block="DetailPanel" data-panel="summary" className="b-panel">
        <StatTiles tiles={tiles} label={summaryLabel ?? "This page in numbers"} />
        <p className="b-caption">Select a lesson to see it here.</p>
      </aside>
    );
  return (
    <aside aria-label="Detail" data-block="DetailPanel" data-panel="open" data-open={`${open.kind}:${open.id}`} className="b-panel">
      <header className="b-phead">
        <div className="min-w-0">
          <h2 className="b-ptitle">{title}</h2>
          {subtitle ? <p className="b-psub">{subtitle}</p> : null}
        </div>
        <Link href={close} className="b-pclose" aria-label="Close the detail" data-panel-close>
          <span aria-hidden="true">×</span>
        </Link>
      </header>
      <div className="b-pactions">
        {full ? (
          <Link href={full} data-panel-full>
            Open as a full page
          </Link>
        ) : null}
        {actions}
      </div>
      <PanelTabs tabs={tabs} first={first} />
    </aside>
  );
}
