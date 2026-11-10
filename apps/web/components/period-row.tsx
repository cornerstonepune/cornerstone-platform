import Link from "@/components/link";
import { ICON_SIZE, Icon, type IconName } from "@/lib/icons";
import { StatusChip, type State } from "./status-chip";

export type Subject = "numeracy" | "language" | "arts" | "fixed";
export type Period = { time: string; subject: Subject; name: string; fact?: string; state?: State; now?: boolean; href: string };
const SUBJECT_ICON: Record<Subject, IconName> = { numeracy: "numeracy", language: "language", arts: "arts", fixed: "break" };

/** time · the subject's icon tile and colour edge · name · subject and one fact · state chip. The row is the link; the
 *  current period carries the action outline; a fixed part of the day is a quiet sand row. */
export function PeriodRow({ periods }: { periods: readonly Period[] }) {
  return (
    <ol data-block="PeriodRow" className="b-periods">
      {periods.map((p) => (
        <li key={p.time + p.name}>
          <Link href={p.href} className="b-prow" data-subject={p.subject} data-press aria-current={p.now ? "time" : undefined}>
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
