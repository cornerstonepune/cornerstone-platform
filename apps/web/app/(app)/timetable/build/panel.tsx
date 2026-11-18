"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/cards";
import { PanelTabs } from "@/components/detail-panel-client";
import { StatusChip } from "@/components/status-chip";
import { Icon } from "@/lib/icons";

// The Build page's right panel (CP-71, wireframe 2): two tabs, Check and Rules, beside the grid. It folds to a 44 px strip that still says
// how many problems are open, by its button or the `[` key, and a person's choice is kept in their own browser (a convenience only: the
// page works the same without it). Folding is not animated: it is a key pressed many times a day.
const KEPT = "cs.build-panel";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (!!t.closest("input, select, textarea") || t.isContentEditable);

/** `lesson`: a lesson of the grid opened (CP-74): it takes the panel, unfolded, until it is closed; Check and Rules are then as they were. */
export function BuildPanel({ open, check, rules, lesson }: { open: { must: number; try: number }; check: ReactNode; rules: ReactNode; lesson?: ReactNode }) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the browser's own memory is read once, after the page is drawn
      if (localStorage.getItem(KEPT) === "folded") setFolded(true);
    } catch {
      // storage refused (a private window): the panel starts open
    }
  }, []);
  // the write is the same however often it runs, so it sits with the change itself
  const toggle = useCallback(
    () =>
      setFolded((was) => {
        try {
          localStorage.setItem(KEPT, was ? "open" : "folded");
        } catch {
          // not kept: the next page starts open
        }
        return !was;
      }),
    [],
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [toggle]);
  // the tab the panel opens on is chosen once: a problem that appears while a rule is being typed does not pull the person away from it
  const [first] = useState(() => (open.must + open.try ? "check" : "rules"));
  const n = open.must + open.try;
  if (lesson)
    return (
      <Card as="aside" className="bd-side b-dpanel" data-inline data-build-panel aria-label="What this lesson teaches">
        {lesson}
      </Card>
    );
  const says = n ? `${n} to look at${open.must ? `, ${open.must} before publishing` : ""}` : "All clear";
  return (
    <Card as="aside" className="bd-side b-dpanel" data-inline data-build-panel data-folded={folded ? "" : undefined} aria-label="Check and rules">
      <div className="bd-side-head" data-folded={folded ? "" : undefined}>
        <button type="button" className="bd-fold" aria-expanded={!folded} aria-controls="bd-side-body" aria-keyshortcuts="[" title={folded ? "Open check and rules ( [ )" : "Fold check and rules ( [ )"} onClick={toggle} data-fold>
          <Icon name={folded ? "collapse" : "expand"} size={20} />
          <span className="sr-only">{folded ? "Open check and rules" : "Fold check and rules"}</span>
        </button>
        {folded ? (
          <span className="bd-fold-n" title={says} data-open-count={n}>
            <StatusChip state={open.must ? "toCheck" : open.try ? "waiting" : "done"} words={String(n)} compact round />
            <span className="sr-only">{says}</span>
          </span>
        ) : null}
      </div>
      <div id="bd-side-body" className="bd-side-body" hidden={folded}>
        <PanelTabs
          tabs={[
            { key: "check", label: n ? `Check (${n})` : "Check" },
            { key: "rules", label: "Rules" },
          ]}
          initial={first}
        >
          {check}
          {rules}
        </PanelTabs>
      </div>
    </Card>
  );
}
