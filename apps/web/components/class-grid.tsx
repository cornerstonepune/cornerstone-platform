"use client";

import Link from "@/components/link";
import { ICON_SIZE, Icon, type IconName } from "@/lib/icons";

export type Look = "ok" | "wait" | "quiet" | "unseen";
export type GridCell = { key: string; no: string; initials: string; name: string; look: Look; icon: IconName; words: string; href?: string; label?: string; attrs?: Record<string, string> };

/** A tinted square per child by Sr. No.: the number, the child's initials disc, the name, and the state's icon and word on
 *  the state's tint; not seen is an untinted square with a dashed ring. A tap acts: a link (a child) or, with `onTap`, a
 *  button (a mark on the confirm screen). 8 columns at 1440, 3 on a phone. A child is never red. */
export function ClassGrid({ cells, label, onTap, showName = true }: { cells: readonly GridCell[]; label: string; onTap?: (key: string) => void; showName?: boolean }) {
  return (
    <ol data-block="ClassGrid" data-grid className="b-cgrid" aria-label={label}>
      {cells.map((c) => {
        const inner = (
          <>
            <span className="b-top">
              <span className="b-no">{c.no}</span>
              {c.initials ? <span className="b-disc" aria-hidden="true">{c.initials}</span> : null}
            </span>
            {showName ? <span className="b-nm">{c.name}</span> : null}
            <span className="b-st">
              <Icon name={c.icon} size={ICON_SIZE.table} />
              {c.words}
            </span>
          </>
        );
        const common = { className: "b-sq", "data-state": c.look, "data-press": "", "aria-label": c.label, ...(c.attrs ?? {}) };
        return (
          <li key={c.key}>
            {onTap || !c.href ? (
              <button type="button" {...common} onClick={() => onTap?.(c.key)}>{inner}</button>
            ) : (
              <Link href={c.href} scroll={false} {...common}>{inner}</Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
