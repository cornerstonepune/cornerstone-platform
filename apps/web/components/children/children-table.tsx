"use client";

import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { ICON_SIZE, Icon } from "@/lib/icons";
import { STATES, StatusChip } from "@/components/status-chip";
import { lastSeenWords, noted, stripWords, type Counts, type Row } from "@/lib/children-view";
import type { Column } from "@/lib/ux-rules";
import { PeekChip } from "./peek";
import { PRACTISING, SECURE, UNSEEN } from "@/lib/looks";

/** The wireframe's state of a group by how they are doing, which tints its heading and the name pills in it. */
const GROUP_STATE: Record<string, "ok" | "wait" | "unseen"> = { [SECURE]: "ok", [PRACTISING]: "wait", [UNSEEN]: "unseen" };

export type Section = { key: string; words: string; total: number; rows: Row[] };

const countWords = (c: Counts) => `${c.secure} secure · ${c.practising} practising · ${c.unseen} not seen`;

/** Three segments, never a red one: secure, practising, not seen yet; their counts sum to the skills of the class. */
export function Bar({ c }: { c: Counts }) {
  const label = `${c.secure} ${STATES.secure.words}, ${c.practising} ${STATES.practising.words}, ${c.unseen} ${STATES.notSeenYet.words}`;
  return (
    <div className="grid gap-1" data-doing={`${c.secure}/${c.practising}/${c.unseen}`}>
      <div className="b-sbar" role="img" aria-label={label}>
        <i data-state="ok" style={{ "--n": c.secure } as React.CSSProperties} />
        <i data-state="wait" style={{ "--n": c.practising } as React.CSSProperties} />
        <i data-state="unseen" style={{ "--n": c.unseen } as React.CSSProperties} />
      </div>
      <span className="b-muted text-[13px]">{countWords(c)}</span>
    </div>
  );
}

/** Notes waiting on a child: a count to confirm or "none". Where the person has no count of their own (a class they do not hold, or
 *  the engine did not answer) the cell is empty, and the column goes when no row has one: a placeholder is not shown. */
function Waiting({ n }: { n: number | null }) {
  if (n === null) return null;
  return n > 0 ? <StatusChip state="toConfirm" words={`${n} to confirm`} compact /> : <span className="b-muted text-[13px]">none</span>;
}

/** The last school days as small cells: a noted absence is a grey cell with its icon and a word beside the strip; a day with no
 *  confirmed lesson is blank, and never reads "present". */
export function Strip({ r }: { r: Row }) {
  const n = noted(r.strip);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="b-days" role="img" aria-label={stripWords(r.strip)} data-days={r.strip.map((d) => d.cell).join(",")}>
        {r.strip.map((d) => (
          <i key={d.date} data-state={d.cell === "absent" ? "quiet" : undefined}>
            {d.cell === "absent" ? <Icon name="absent" size={ICON_SIZE.table} /> : null}
          </i>
        ))}
      </span>
      {n > 0 ? (
        <StatusChip state="absent" words={`${n} noted`} compact />
      ) : (
        <span className="b-muted text-[13px]">none</span>
      )}
    </span>
  );
}

function columns(showClass: boolean, today: string): Column<Row>[] {
  const name = (r: Row) => ({ classId: r.classId, roll: r.roll, name: r.name, section: r.section, counts: r.counts });
  return [
    { key: "who", label: "Sr. No. and name", keep: true, value: (r) => `${r.roll} ${r.name}`, cell: (r) => <PeekChip child={name(r)} /> },
    ...(showClass ? [{ key: "class", label: "Class", keep: true, value: (r: Row) => r.section } satisfies Column<Row>] : []),
    { key: "doing", label: "How they are doing", keep: true, value: (r) => countWords(r.counts), cell: (r) => <Bar c={r.counts} /> },
    { key: "help", label: "Needs help on", value: (r) => r.helpOn, cell: (r) => (r.helpOn ? <span>{r.helpOn}</span> : null) },
    { key: "seen", label: "Last seen", keep: true, value: (r) => lastSeenWords(r.lastSeen, today) },
    { key: "waiting", label: "Notes waiting", status: true, value: (r) => r.waiting, cell: (r) => <Waiting n={r.waiting} /> },
    { key: "absences", label: "Absences noted", keep: true, status: true, value: (r) => noted(r.strip), cell: (r) => <Strip r={r} /> },
  ];
}

/** A class's header counts, in whole numbers and words: answers waiting for a person and parent reports waiting. No score, no rank. */
export function ClassCountsLine({ section, counts, reportsHref }: { section?: string; counts: { answers: number; reports: number }; reportsHref?: string }) {
  const n = (c: number, one: string, many: string) => (c === 0 ? `No ${many} waiting` : `${c} ${c === 1 ? one : many} waiting`);
  return (
    <p className="b-caption" data-class-counts={section ?? ""}>
      {section ? <strong>{section}: </strong> : null}
      {counts.answers > 0 ? <Link href="/children/assessments?status=check">{n(counts.answers, "answer", "answers")}</Link> : n(0, "answer", "answers")} · {counts.reports > 0 && reportsHref ? <Link href={reportsHref}>{n(counts.reports, "parent report", "parent reports")}</Link> : n(counts.reports, "parent report", "parent reports")}
    </p>
  );
}

/** The page's rows, a heading and a count over each group when grouped; the same table, in Sr. No. order, when not. */
export function ChildrenTable({ sections, grouped, showClass, today, page, hrefOf }: { sections: readonly Section[]; grouped: boolean; showClass: boolean; today: string; page: { n: number; pages: number }; hrefOf: Record<number, string> }) {
  const cols = columns(showClass, today);
  return (
    <div className={grouped ? "b-groups" : undefined} data-block="ChildrenGroups">
      {sections.map((s) => (
        <section key={s.key} className="b-grp" data-state={grouped ? GROUP_STATE[s.key] : undefined} aria-label={`${s.words}, ${s.total} ${s.total === 1 ? "child" : "children"}`} data-group={s.key}>
          {grouped ? (
            <h3 className="b-grp-h">
              {s.words} <span className="b-count" data-count={s.key}>{s.total}</span>
            </h3>
          ) : null}
          {s.rows.length === 0 ? (
            <p className="b-muted text-[13px]">The {s.total === 1 ? "child" : "children"} of this group {s.total === 1 ? "is" : "are"} on another page.</p>
          ) : (
            <DataTable<Row> label={`Children${grouped ? ` · ${s.words}` : ""}`} columns={cols} rows={s.rows} rowKey={(r) => r.childId} extras={{ attrs: (r) => ({ "data-child": r.childId }) }} more={{ page: 1, href: () => "" }} limit={s.rows.length} />
          )}
        </section>
      ))}
      {page.pages > 1 ? (
        <nav className="mt-2 flex items-center gap-3 text-[13px]" aria-label="Children pages" data-more>
          {page.n > 1 ? <a href={hrefOf[page.n - 1]} className="chip">← Earlier</a> : null}
          <span>Page {page.n} of {page.pages}</span>
          {page.n < page.pages ? <a href={hrefOf[page.n + 1]} className="chip">Later →</a> : null}
        </nav>
      ) : null}
    </div>
  );
}
