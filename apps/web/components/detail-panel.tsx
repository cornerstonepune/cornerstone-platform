import type { ReactNode } from "react";
import Link from "@/components/link";
import { Icon } from "@/lib/icons";
import { KindTile, type Kind } from "./kind-tile";
import { StatTiles, type Stat } from "./stat-tile";
import { PanelReturn, PanelShell, PanelTabs } from "./detail-panel-client";

// DetailPanel (docs/frontend/page-charter.md A2): the right side of a page. Choosing a thing on the page (a lesson block, a child, a paper)
// opens its detail here, in tabs, without leaving the page; the address carries `?open=<kind>:<id>` (and `tab=`), so it can be linked,
// reloaded, and opened full page at the thing's own address. Close (the ×, or Escape) and you are where you were, focus back on the thing.
// With nothing chosen it is the page's summary: three or four stat tiles, never a list of links (the sidebar holds those). On a phone an
// open panel covers the page as a sheet; the summary sits under the page.
export type PanelTab = { key: string; label: string; body: ReactNode };
export type Opened = {
  /** `<kind>:<id>`, as the address says it; the thing on the page that opened it carries the same `data-open-key`. */
  key: string;
  kind: Kind;
  title: string;
  /** One line of facts under the title. */
  line?: string;
  /** The thing's own page (the panel opened full page). */
  full?: string;
  /** The address of this page with the panel closed; none for a panel that is the page's own right side and never closes (the lesson page). */
  closeHref?: string;
  /** The actions on the thing (the coordinator's Move, Edit, Choose activity), above the tabs. */
  actions?: ReactNode;
  tabs: readonly PanelTab[];
  /** The tab the address names; the first when it names none. */
  tab?: string;
};

/** The `?open=` of an address: its kind and id, or none when the value is not `<kind>:<id>`. */
export function parseOpen(v: string | undefined): { kind: string; id: string } | null {
  const m = /^([a-z]+):([\w~.-]{1,80})$/.exec(v ?? "");
  return m ? { kind: m[1], id: m[2] } : null;
}

/** `inline`: drawn where it stands, never as a sheet over the page, and it takes no focus (the blocks gallery's sample). */
export function DetailPanel({ open, summary, inline }: { open?: Opened | null; summary: { title: string; stats: readonly Stat[]; after?: ReactNode }; inline?: boolean }) {
  if (!open)
    return (
      <aside data-block="DetailPanel" data-panel="summary" aria-labelledby="panel-summary-h" className="b-dpanel">
        <h2 id="panel-summary-h" className="b-dpanel-eyebrow">
          {summary.title}
        </h2>
        <StatTiles label={summary.title} stats={summary.stats} />
        {summary.after}
        <PanelReturn />
      </aside>
    );
  const tab = open.tabs.some((t) => t.key === open.tab) ? open.tab! : open.tabs[0]?.key;
  return (
    <PanelShell openKey={open.key} closeHref={open.closeHref} inline={inline}>
      <header className="b-dpanel-head">
        <KindTile kind={open.kind} />
        <div className="min-w-0">
          <h2 id="panel-h" tabIndex={-1} data-panel-title className="b-dpanel-title">
            {open.title}
          </h2>
          {open.line ? <p className="b-muted b-label">{open.line}</p> : null}
        </div>
        {open.closeHref ? (
          <Link href={open.closeHref} scroll={false} data-panel-close aria-label="Close the panel" title="Close (Esc)" className="b-dpanel-x">
            <Icon name="close" size={20} />
          </Link>
        ) : null}
      </header>
      {open.full || open.actions ? (
        <div className="b-dpanel-actions" data-panel-actions>
          {open.actions}
          {open.full ? (
            <Link href={open.full} data-panel-full className="b-dpanel-full">
              Open full page
            </Link>
          ) : null}
        </div>
      ) : null}
      <PanelTabs tabs={open.tabs.map((t) => ({ key: t.key, label: t.label }))} initial={tab}>
        {open.tabs.map((t) => (
          <div key={t.key} data-tab-body={t.key}>
            {t.body}
          </div>
        ))}
      </PanelTabs>
    </PanelShell>
  );
}
