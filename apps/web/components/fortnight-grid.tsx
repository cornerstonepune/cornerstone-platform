import Link from "@/components/link";
import { ICON_SIZE, Icon } from "@/lib/icons";
import type { Subject } from "./period-row";
import { StatusChip, type State } from "./status-chip";
import { MachineMark } from "./origin";

/** A lesson as a block. `openKey`: the block opens the page's detail panel (page charter A2) at `href`, without scrolling, and `selected` marks
 *  the one open (a ring, and `aria-expanded` read with the panel beside it). `href`: where a plain click goes, the lesson's activity page (none when it has none: then the block is not a link and
 *  says nothing more). `pick`: the coordinator's click, choosing this block as the lesson to move or the one to swap it with; the activity link
 *  then sits on the block as its own small link. `picked`: this is the lesson chosen to move. `note`: the rule's words, when a clash is on it. */
export type FCell = { subject: Exclude<Subject, "fixed">; activity: string; href?: string; pick?: string; picked?: boolean; chip?: State; now?: boolean; moved?: boolean; clash?: boolean; note?: string; openKey?: string; selected?: boolean; /** the lesson's activity was linked by the machine (CP-48): the block carries its one symbol */ machine?: boolean };
/** A free slot (a lesson period with no lesson that day): offered only while a lesson is chosen to move, as a place to move it to. */
export type FSlot = { slot: string; label: string };
export type FRow = { band: string } | { time: string; cells: readonly (FCell | FSlot | null)[] };
export const SUBJECT = { numeracy: "Numeracy", language: "Language", arts: "Arts" } as const;

/** Days across, periods down; each cell filled with its subject's tint, a 3 px top edge in the subject colour, the subject's
 *  icon and word and the activity; fixed parts of the day are full-width sand bands; today's head is the action colour;
 *  moved is a dashed amber outline plus the Moved chip; a clash a red outline plus the Clash chip and the rule's words. A chip on a
 *  cell sits on the panel colour with its ring. */
export function FortnightGrid({ days, today, rows, dayHrefs }: { days: readonly string[]; today?: string; rows: readonly FRow[]; /** a link for each day head, when the heads open their day */ dayHrefs?: readonly (string | undefined)[] }) {
  // A fortnight is two weeks stacked, five days each, never ten narrow columns (13 Nov 2026: "cards overlap, the time is not clean"):
  // each week its own grid with the same time ruler, so a column is wide enough for a lesson's name on two lines.
  const weeks = days.length > 5 && days.length % 5 === 0 ? Array.from({ length: days.length / 5 }, (_, w) => w * 5) : [0];
  const per = weeks.length > 1 ? 5 : days.length;
  return (
    <div data-block="FortnightGrid" className="b-fgrid-box">
      {weeks.map((from) => (
        <Week key={from} from={from} per={per} days={days} today={today} rows={rows} dayHrefs={dayHrefs} labelled={weeks.length > 1} />
      ))}
    </div>
  );
}

/** "Mon 23" as a calendar head: the weekday small, the date large; its text stays "Mon 23". */
function Head({ d }: { d: string }) {
  const [wd, ...rest] = d.split(" ");
  return rest.length ? (
    <>
      <span className="b-dh-wd">{wd}</span> <b className="b-dh-n">{rest.join(" ")}</b>
    </>
  ) : (
    <>{d}</>
  );
}

/** "09:40–10:00": the start on top, the end under it, muted; its text stays the range. */
function Time({ t }: { t: string }) {
  const [a, b] = t.split("–");
  return b ? (
    <>
      <b>{a}</b>
      <span className="b-tm-end">–{b}</span>
    </>
  ) : (
    <>{t}</>
  );
}

function Week({ from, per, days, today, rows, dayHrefs, labelled }: { from: number; per: number; days: readonly string[]; today?: string; rows: readonly FRow[]; dayHrefs?: readonly (string | undefined)[]; labelled: boolean }) {
  const shown = days.slice(from, from + per);
  // a row with no lesson in this week is left out of it; the fixed parts of the day stay as bands
  const mine = rows.filter((r) => "band" in r || r.cells.slice(from, from + per).some(Boolean));
  return (
    <section className="b-fweek" aria-label={labelled ? `Week of ${shown[0]}` : undefined}>
      <div className="b-fgrid" style={{ "--cols": shown.length } as React.CSSProperties}>
        <span />
        {shown.map((d, i) =>
          dayHrefs?.[from + i] ? (
            <Link key={d} href={dayHrefs[from + i]!} className="b-dh" aria-current={d === today ? "date" : undefined}>
              <Head d={d} />
            </Link>
          ) : (
            <span key={d} className="b-dh" aria-current={d === today ? "date" : undefined}>
              <Head d={d} />
            </span>
          ),
        )}
        {mine.map((r, i) =>
          "band" in r ? (
            <span key={i} className="b-band"><Icon name="break" size={ICON_SIZE.table} />{r.band}</span>
          ) : (
            [
              <span key={`${i}t`} className="b-tm"><Time t={r.time} /></span>,
              ...r.cells.slice(from, from + per).map((c, j) =>
                !c ? (
                  <span key={`${i}-${j}`} />
                ) : "slot" in c ? (
                  <Link key={`${i}-${j}`} href={c.slot} className="b-slot" data-slot>{c.label}</Link>
                ) : (
                  <Cell key={`${i}-${j}`} c={c} />
                ),
              ),
            ]
          ),
        )}
      </div>
    </section>
  );
}

function Cell({ c }: { c: FCell }) {
  const cls = `b-cell${c.moved ? " b-moved" : ""}${c.clash ? " b-clash" : ""}${c.picked ? " b-picked" : ""}`;
  // a clash says so on the block, and a move by hand says so; a lesson in progress, done or late says that
  const chip: State | undefined = c.clash ? "clash" : c.moved ? "moved" : c.chip;
  const inside = (
    <>
      <span className="b-subj"><Icon name={c.subject} size={ICON_SIZE.table} />{SUBJECT[c.subject]}</span>
      <b className="b-act" title={c.activity}>{c.activity}{c.machine ? <> <MachineMark /></> : null}</b>
      {chip ? <StatusChip state={chip} words={c.clash ? "Clash" : c.moved ? "Moved" : undefined} onTint round /> : null}
      {c.note ? <small className="b-note" data-clash-note>{c.note}</small> : null}
    </>
  );
  const common = { "data-subject": c.subject, "aria-current": c.now ? ("time" as const) : undefined };
  if (c.pick)
    return (
      <div className="b-cell-w">
        <Link href={c.pick} className={cls} data-pick aria-pressed={c.picked ?? false} data-press {...common}>{inside}</Link>
        {c.href ? <Link href={c.href} className="b-open" data-activity-link>Activity</Link> : null}
      </div>
    );
  if (c.href && c.openKey)
    return (
      <Link href={c.href} scroll={false} className={`${cls}${c.selected ? " b-selected" : ""}`} data-press data-open-key={c.openKey} aria-expanded={c.selected ?? false} aria-controls={c.selected ? "detail-panel" : undefined} {...common}>
        {inside}
      </Link>
    );
  if (c.href) return <Link href={c.href} className={cls} data-press {...common}>{inside}</Link>;
  return <div className={cls} {...common}>{inside}</div>;
}
