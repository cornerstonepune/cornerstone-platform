import Link from "@/components/link";
import { ICON_SIZE, Icon, type IconName } from "@/lib/icons";
import { StatusChip, type State } from "./status-chip";

export type Subject = "numeracy" | "language" | "arts" | "fixed";
/** `openKey`: the row opens the page's detail panel (page charter A2) at `href` without scrolling; `selected` marks the one open there. */
export type Period = { time: string; subject: Subject; name: string; fact?: string; state?: State; now?: boolean; href: string; openKey?: string; selected?: boolean };
const SUBJECT_ICON: Record<Subject, IconName> = { numeracy: "numeracy", language: "language", arts: "arts", fixed: "break" };

/** time · the subject's icon tile and colour edge · name · subject and one fact · state chip. The row is the link; the
 *  current period carries the action outline; a fixed part of the day is a quiet sand row. `tinted`: each row is filled with its
 *  subject's colour (Today's timeline, page charter B1), not only edged with it. */
export function PeriodRow({ periods, tinted, label }: { periods: readonly Period[]; tinted?: boolean; label?: string }) {
  return (
    <ol data-block="PeriodRow" className="b-periods" aria-label={label} data-tinted={tinted ? "" : undefined}>
      {periods.map((p) => (
        <li key={p.time + p.name}>
          <Link
            href={p.href}
            className={`b-prow${p.selected ? " b-selected" : ""}`}
            data-subject={p.subject}
            data-press
            aria-current={p.now ? "time" : undefined}
            {...(p.openKey ? { scroll: false, "data-open-key": p.openKey, "aria-expanded": p.selected ?? false, "aria-controls": p.selected ? "detail-panel" : undefined } : {})}
          >
            <span className="b-t">{p.time}</span>
            <span className="b-stile">
              <Icon name={SUBJECT_ICON[p.subject]} size={ICON_SIZE.row} />
            </span>
            <span className="b-nm">
              <b>{p.name}</b>
              {p.fact ? <span>{p.fact}</span> : null}
            </span>
            {p.state ? <StatusChip state={p.state} round /> : null}
          </Link>
        </li>
      ))}
    </ol>
  );
}
