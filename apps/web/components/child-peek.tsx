"use client";

import { useEffect, useRef } from "react";
import { ICON_SIZE, Icon } from "@/lib/icons";
import { StatusChip, type State } from "./status-chip";
import { Timeline, type Seen } from "./timeline";

export type Peeked = { no: string; initials: string; name: string; className: string };
export type PeekCount = { state: State; words: string };

/** A child as a chip (a cluster, a group, a list of Sr. Nos.): a button that opens ChildPeek. */
export function NameChip({ no, name, onOpen }: { no: string; name: string; onOpen: () => void }) {
  return (
    <button type="button" className="b-nchip" data-peek-open={no} data-press="" onClick={onOpen}>
      <span className="b-no b-num">{no}</span>
      {name}
    </button>
  );
}

/** One child's recent history in a panel (the top of the rail on a wide screen, a sheet over the bottom on a phone):
 *  initials disc, Sr. No., name, class; the child's state counts as chips; then what was seen, newest first, each with a
 *  kind tile, one line, who and when. Close, or Escape, closes it and gives focus back to the button that opened it;
 *  'Open the child' is the one way from a list to the child's own page. */
export function ChildPeek({ child, counts, entries, openHref, onClose }: { child: Peeked; counts: readonly PeekCount[]; entries: readonly Seen[]; openHref: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const done = useRef(onClose);
  useEffect(() => {
    done.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") done.current();
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      opener?.focus();
    };
  }, []);
  return (
    <aside data-block="ChildPeek" className="b-peek" aria-label="Recent history of one child" data-peek={child.no}>
      <div className="b-peek-h">
        <span className="b-disc" aria-hidden="true">{child.initials}</span>
        <span className="b-who">
          <b>{child.name}</b>
          <span className="b-muted">
            <span className="b-num">{child.no}</span> · {child.className}
          </span>
        </span>
        <button ref={close} type="button" className="b-iconbtn" aria-label="Close" data-press="" onClick={onClose}>
          <Icon name="close" size={ICON_SIZE.row} />
        </button>
      </div>
      <div className="b-keyrow">
        {counts.map((c) => (
          <StatusChip key={c.state} state={c.state} words={c.words} compact />
        ))}
      </div>
      <Timeline entries={entries} />
      <a href={openHref} className="b-btn b-peek-more" data-press="">
        Open the child
      </a>
    </aside>
  );
}
