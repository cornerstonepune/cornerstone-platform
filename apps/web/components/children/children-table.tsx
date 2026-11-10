"use client";

import { DataTable } from "@/components/data-table";
import { ICON_SIZE, Icon } from "@/lib/icons";
import { STATES, StatusChip } from "@/components/status-chip";
import { lastSeenWords, noted, stripWords, type Counts, type Row } from "@/lib/children-view";
import type { Column } from "@/lib/ux-rules";
import { PeekChip } from "./peek";

export type Section = { key: string; words: string; icon?: "secure" | "practising" | "not-seen" | "child" | "class"; total: number; rows: Row[] };

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

function columns(showClass: boolean, today: string, waiting: boolean): Column<Row>[] {
  const name = (r: Row) => ({ classId: r.classId, roll: r.roll, name: r.name, section: r.section, counts: r.counts });
  return [
    { key: "who", label: "Sr. No. and name", keep: true, value: (r) => `${r.roll} ${r.name}`, cell: (r) => <PeekChip child={name(r)} /> },
    ...(showClass ? [{ key: "class", label: "Class", keep: true, value: (r: Row) => r.section } satisfies Column<Row>] : []),
    { key: "doing", label: "How they are doing", keep: true, value: (r) => countWords(r.counts), cell: (r) => <Bar c={r.counts} /> },
    { key: "seen", label: "Last seen", keep: true, value: (r) => lastSeenWords(r.lastSeen, today) },
    // notes waiting per child need pii.note_claim.child_id, not yet on main: the column says so, dashed, and shows no count
    ...(waiting ? [] : [{ key: "waiting", label: "Notes waiting", keep: true, status: true, value: () => "not available yet", cell: () => <span className="b-pending text-[13px]" title="Not available yet">not available yet</span> } satisfies Column<Row>]),
    { key: "absences", label: "Absences noted", keep: true, status: true, value: (r) => noted(r.strip), cell: (r) => <Strip r={r} /> },
  ];
}

/** The page's rows, a heading and a count over each group when grouped; the same table, in Sr. No. order, when not. */
export function ChildrenTable({ sections, grouped, showClass, today, page, hrefOf }: { sections: readonly Section[]; grouped: boolean; showClass: boolean; today: string; page: { n: number; pages: number }; hrefOf: Record<number, string> }) {
  const cols = columns(showClass, today, false);
  return (
    <div className={grouped ? "b-groups" : undefined}>
      {sections.map((s) => (
        <section key={s.key} className="b-grp" aria-label={`${s.words}, ${s.total} ${s.total === 1 ? "child" : "children"}`} data-group={s.key}>
          {grouped ? (
            <h3 className="b-grp-h">
              {s.words} <span className="b-count" data-count={s.key}>{s.total}</span>
            </h3>
          ) : null}
          {s.rows.length === 0 ? (
            <p className="b-muted text-[13px]">The {s.total === 1 ? "child" : "children"} of this group {s.total === 1 ? "is" : "are"} on another page.</p>
          ) : (
            <DataTable<Row> label={`Children${grouped ? ` · ${s.words}` : ""}`} columns={cols} rows={s.rows} rowKey={(r) => r.childId} more={{ page: 1, href: () => "" }} limit={s.rows.length} />
          )}
        </section>
      ))}
      {page.pages > 1 ? (
        <nav className="mt-2 flex items-center gap-3 text-[13px]" aria-label="Children pages">
          {page.n > 1 ? <a href={hrefOf[page.n - 1]} className="chip">← Earlier</a> : null}
          <span>Page {page.n} of {page.pages}</span>
          {page.n < page.pages ? <a href={hrefOf[page.n + 1]} className="chip">Later →</a> : null}
        </nav>
      ) : null}
    </div>
  );
}
