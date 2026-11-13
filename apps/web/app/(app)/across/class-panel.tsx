import Link from "@/components/link";
import { Count } from "@/components/count";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import type { Opened } from "@/components/detail-panel";
import { StatusChip } from "@/components/status-chip";
import type { ClassAcross } from "@/lib/across-classes";
import { STAGE_STATE } from "@/lib/assessment-ui";
import { stageOrder } from "@/lib/queries-across";
import { STAGE_WORDS } from "@/lib/queries-papers";
import { dateWords, weekWords } from "@/lib/week";
import type { ClassStage } from "@/lib/queries-across";

/** Where a class's newest assessment in a subject stands: one chip per stage its copies are at, least advanced first. */
export function StageChips({ s }: { s: ClassStage }) {
  return (
    <span className="flex flex-wrap gap-1">
      {stageOrder.filter((st) => s.by[st]).map((st) => (
        <StatusChip key={st} state={STAGE_STATE[st]} words={`${s.by[st]} ${STAGE_WORDS[st]}`} />
      ))}
    </span>
  );
}

/** A class opened on the right (page charter A2): the rows behind each number of its table row, one tab each. The class's picture is the
 *  panel opened full page. Every row is what the page listed before it was a Dashboard, word for word. */
export function classPanel(c: ClassAcross, o: { key: string; name: string; full: string | null; hours: number; days: number; subjects: number; tab?: string }): Opened {
  const stage = c.stages.length ? (
    <DataTable
      label="Each class and subject"
      rows={c.stages}
      rowKey={(s) => `${s.section}|${s.subject}`}
      more={{ page: 1, href: () => o.full ?? "/across" }}
      columns={[
        { key: "subject", label: "Subject", value: (s) => s.subject, keep: true },
        { key: "title", label: "Newest assessment", value: (s) => s.title, cell: (s) => (<>{s.title}<span className="block b-label b-muted">{weekWords(s.week)}</span></>) },
        { key: "stage", label: "Where its papers stand", value: (s) => stageOrder.filter((st) => s.by[st]).length, cell: (s) => <StageChips s={s} /> },
      ]}
    />
  ) : (
    <EmptyState>This class has no assessment yet.</EmptyState>
  );
  const overdue = (
    <section aria-label="Checks overdue" className="grid gap-[var(--space-2)]">
      <p className="b-label b-muted">Waiting over {o.hours} hours</p>
      {c.overdue ? (
        <ul className="grid gap-2">
          <li data-class={c.section}>
            <strong>{o.name}</strong>: <Count of="overdue-answers" n={c.overdue.answers} /> {c.overdue.answers === 1 ? "answer" : "answers"} on {c.overdue.papers}{" "}
            {c.overdue.papers === 1 ? "paper" : "papers"} waiting for a person, the oldest read {dateWords(c.overdue.oldest)}.{" "}
            <Link href="/children/assessments?status=check">Check them →</Link>
          </li>
        </ul>
      ) : (
        <EmptyState>No answer has waited for a person over {o.hours} hours.</EmptyState>
      )}
    </section>
  );
  const missing = c.missing.length ? (
    <DataTable
      label="Papers not back"
      rows={c.missing}
      rowKey={(m) => m.qr}
      more={{ page: 1, href: () => "/across" }}
      limit={c.missing.length}
      columns={[
        { key: "roll", label: "Roll", value: (m) => m.roll_no },
        { key: "paper", label: "Paper", value: (m) => m.title, cell: (m) => (<>{m.title}<span className="block b-label b-muted">code <Link href={`/worksheets/${m.qr}`} data-paper-code>{m.qr}</Link></span></>) },
        { key: "given", label: "Given", value: (m) => dateWords(m.since) },
        { key: "days", label: "Days", value: (m) => m.days, num: true },
      ]}
    />
  ) : (
    <EmptyState>Every paper given over {o.days} days ago is back.</EmptyState>
  );
  const help = (
    <section aria-label="Needing help in two or more subjects">
      {c.struggling.length ? (
        <ul className="grid gap-2">
          {c.struggling.map((k) => (
            <li key={k.child_id}>
              <Link href={`/growth/${k.child_id}`} data-child-link>{k.name}</Link> · {c.section} · Roll {k.roll_no}: needs help in {k.subjects.join(" and ")}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          No child in this class needs help in two or more subjects.
          {o.subjects < 2 ? ` Only ${o.subjects === 1 ? "one subject has" : "no subject has"} children's results so far.` : ""}
        </EmptyState>
      )}
    </section>
  );
  return {
    key: o.key,
    kind: "child",
    title: o.name,
    line: `${c.follow} to follow up`,
    full: o.full ?? undefined,
    closeHref: "/across",
    tab: o.tab,
    tabs: [
      { key: "stage", label: "Stage", body: stage },
      { key: "overdue", label: "Overdue", body: overdue },
      { key: "missing", label: "Not back", body: missing },
      { key: "help", label: "Needing help", body: help },
    ],
  };
}
