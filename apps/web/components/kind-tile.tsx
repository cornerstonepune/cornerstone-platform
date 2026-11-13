import { ICON_SIZE, Icon, type IconName } from "@/lib/icons";

/** The seven kinds of thing, each with its icon (lib/icons.tsx) and its colour (the kind-* tokens). */
export const KINDS = ["period", "child", "activity", "objective", "skill", "assessment", "note"] as const;
export type Kind = (typeof KINDS)[number];

/** A 32 px tile filled with a kind's tint and holding that kind's icon in its colour. Every rail link, card header and
 *  timeline entry starts with one. `icon` draws another icon in the kind's colour (a class, a member of staff: the school's things that are
 *  not one of the seven kinds). */
export function KindTile({ kind, title, icon }: { kind: Kind; title?: string; icon?: IconName }) {
  return (
    <span data-block="KindTile" data-kind={kind} className="b-tile" title={title}>
      <Icon name={icon ?? (kind satisfies IconName)} size={ICON_SIZE.row} />
    </span>
  );
}

/** A rail link ("Connected to"): a kind tile and words. */
export function KindLink({ kind, href, children, note }: { kind: Kind; href: string; children: React.ReactNode; note?: string }) {
  return (
    <a href={href} className="b-ritem" data-rail-link data-kind={kind}>
      <KindTile kind={kind} />
      <span>
        {children}
        {note ? <small>{note}</small> : null}
      </span>
    </a>
  );
}
