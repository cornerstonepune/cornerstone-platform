import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { AttentionStrip } from "@/components/attention-strip";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KanbanBoard, type Lane } from "@/components/kanban-board";
import { StackBar } from "@/components/stack-bar";
import { StatusChip, type State } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { grades } from "@/lib/queries";
import { engineSend } from "@/lib/engine";
import { Lines, type StagedLine } from "./lines";
import { lineFacts, reportsRows, seesConsent, STAGES, STAGE_WORDS, STATE_OF, stageOf, totalLines, type Consent, type ReportsRow, type Stage } from "@/lib/queries-report-rows";
import { workScope } from "@/lib/reach";
import { classWords } from "@/lib/needs-you";
import type { Column } from "@/lib/ux-rules";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/children/reports";

// Reports (UI-8, docs/frontend/wireframes/reports.html): each child's report line by line, in the educator's words. Two approvals a line
// (an educator of the class, then a coordinator), consent on file, then sent. The page is a strip of what waits, an opened child's line
// cards, the reports grouped by where they stand, the same reports as a board, and (for the coordinator, who alone may see consent) the
// consent on file as a bar. Rows are in class and Sr. No. order within a stage: no figure here is a score, rate, rank or ordering of a person.
// Not here, parked until the end (docs/notes/UI-8.md): writing the lines from a drafted report, and the parent's-copy PDF.
const REPORT_CHIP: Record<string, State> = { "out of date": "doNow", "to approve": "toApprove", "to write": "toDo", approved: "approved", "nothing yet": "notYet" };
const CONSENT_WORDS: Record<Consent, string> = { given: "on file", withdrawn: "withdrawn: needed", none: "none on record: needed" };
const LANES: { stage: Exclude<Stage, "none">; state: State; empty: string }[] = [
  { stage: "drafted", state: "toDo", empty: "No report is waiting for an educator's approval." },
  { stage: "educator", state: "toApprove", empty: "No report is waiting for the coordinator." },
  { stage: "coordinator", state: "approved", empty: "No report is ready to send." },
  { stage: "sent", state: "done", empty: "No report has been sent yet." },
];

/** How far a stage's approvals have come, as "3 of 6": a chip toned by whether all, some or none of the lines have it. */
const ofTotal = (n: number, total: number): { state: State; words: string } => ({ state: n === total ? "done" : n > 0 ? "toApprove" : "toDo", words: `${n} of ${total}` });

export default async function ReportsScreen({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  const [all, g, coordinator] = await deadline(Promise.all([reportsRows(me.email, await workScope(me)), grades(), seesConsent()]));
  const classes = [...new Set(all.map((r) => r.section))];
  const f = {
    class: classes.includes(q.class ?? "") ? q.class : undefined,
    state: (STAGES as readonly string[]).includes(q.state ?? "") ? (q.state as Stage) : undefined,
  };
  const inClass = all.filter((r) => !f.class || r.section === f.class);
  // within a stage the rows stay in class and Sr. No. order (a stable sort of the query's own order)
  const rows = inClass.filter((r) => !f.state || stageOf(r) === f.state).sort((a, b) => STAGES.indexOf(stageOf(a)) - STAGES.indexOf(stageOf(b)));
  const href = (over: Record<string, string | undefined>) => `${HERE}?${new URLSearchParams(Object.entries({ ...(f.class ? { class: f.class } : {}), ...(f.state ? { state: f.state } : {}), ...over }).filter((e): e is [string, string] => !!e[1]))}`;
  const openHref = (id: string) => href({ open: id });

  // the lines of the one child opened (?open=): staged by the engine, which also decides who may see them
  const open = rows.find((r) => r.child_id === q.open && r.note_id);
  const got = open ? await engineSend("/reports/lines", { actor: me.email, note_id: open.note_id! }).catch(() => null) : null;
  const staged = got?.ok ? ((await got.json()) as { lines: StagedLine[]; sent_at: string | null }) : null;
  const facts = open && staged ? await lineFacts(open.child_id, staged.lines.flatMap((l) => l.evidence)) : new Map();

  // the one main action: the first report with lines waiting to be approved (the first approval is an educator's, the second a
  // coordinator's), else the first report; the next step is the list of what needs doing
  const toApprove = rows.find((r) => r.note_id && (r.lines.drafted > 0 || (coordinator && r.lines.educator > 0))) ?? rows.find((r) => r.note_id) ?? rows[0];

  // what waits, as whole counts of lines and reports for the class chosen
  const waiting = inClass.reduce((n, r) => n + r.lines.drafted + (coordinator ? r.lines.educator : 0), 0);
  const noConsent = inClass.filter((r) => r.consent && r.consent !== "given").length;
  const onFile = inClass.filter((r) => r.consent === "given").length;
  const sent = inClass.filter((r) => r.sent_at).length;
  const waitingRow = inClass.find((r) => r.note_id && (r.lines.drafted > 0 || (coordinator && r.lines.educator > 0)));

  const columns: Column<ReportsRow>[] = [
    {
      key: "child",
      label: "Sr. No. and name",
      value: (r) => `${r.roll_no} ${r.first_name}`,
      cell: (r) => (
        <>
          <span className="num">{r.roll_no}</span> <Link href={`/growth/${r.child_id}/parent`}>{r.first_name}</Link>
        </>
      ),
    },
    { key: "class", label: "Class", width: "7rem", value: (r) => classWords(g, r.band, r.section) },
    {
      key: "lines",
      label: "Lines",
      width: "11rem",
      value: (r) => (totalLines(r) ? `${totalLines(r)} lines` : STATE_OF(r)),
      // a report with lines: how many, their words read-only, and the way to its cards; one without: its whole-report state in words
      cell: (r) =>
        totalLines(r) ? (
          <Details summary={`${totalLines(r)} ${totalLines(r) === 1 ? "line" : "lines"}`}>
            <ul className="list-disc pl-5">
              {r.line_words.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <Link href={openHref(r.child_id)}>Open the lines</Link>
          </Details>
        ) : (
          <StatusChip state={REPORT_CHIP[STATE_OF(r)]} words={STATE_OF(r)} />
        ),
    },
    {
      key: "educator",
      label: "Educator approved",
      status: true,
      width: "9rem",
      value: (r) => (totalLines(r) ? `${r.lines.educator + r.lines.coordinator} of ${totalLines(r)}` : null),
      cell: (r) => <StatusChip {...ofTotal(r.lines.educator + r.lines.coordinator, totalLines(r))} />,
    },
    {
      key: "coordinator",
      label: "Coordinator approved",
      status: true,
      width: "9rem",
      value: (r) => (totalLines(r) ? `${r.lines.coordinator} of ${totalLines(r)}` : null),
      cell: (r) => <StatusChip {...ofTotal(r.lines.coordinator, totalLines(r))} />,
    },
    {
      key: "consent",
      label: "Consent",
      status: true,
      width: "10rem",
      value: (r) => (r.consent ? CONSENT_WORDS[r.consent] : null),
      cell: (r) => (r.consent ? <StatusChip state={r.consent === "given" ? "done" : "notYet"} words={CONSENT_WORDS[r.consent]} /> : null),
    },
    { key: "sent", label: "Sent", width: "7rem", value: (r) => (r.sent_at ? r.sent_at.slice(0, 10) : "not sent") },
  ];

  const lanes: Lane[] = LANES.map((l) => {
    const mine = rows.filter((r) => stageOf(r) === l.stage);
    return {
      key: l.stage,
      label: l.stage === "coordinator" ? "Coordinator approved" : STAGE_WORDS[l.stage],
      state: l.state,
      count: mine.length,
      empty: l.empty,
      cards: mine.map((r) => ({
        key: r.child_id,
        kind: "child" as const,
        title: `${r.roll_no} ${r.first_name}`,
        sub: r.sent_at ? `Sent ${r.sent_at.slice(0, 10)}` : `${r.lines.educator + r.lines.coordinator} of ${totalLines(r)} approved${r.consent && r.consent !== "given" ? " · consent missing" : ""}`,
        href: openHref(r.child_id),
        state: l.state,
      })),
    };
  });

  const groupName = (r: ReportsRow) => `${STAGE_WORDS[stageOf(r)]} · ${rows.filter((x) => stageOf(x) === stageOf(r)).length}`;
  const stageOfGroup = (name: string) => STAGES.find((s) => name.startsWith(`${STAGE_WORDS[s]} · `));

  return (
    <Screen
      stage={`${f.class ? (classWords(g, inClass[0]?.band ?? "", f.class)) : "Every class"} · this term · ${inClass.length} ${inClass.length === 1 ? "child" : "children"}`}
      title="Reports"
      purpose="Each child's report, line by line, in the educator's words. Nothing goes out until it is approved and consent is on file."
      action={
        <Link href={toApprove ? openHref(toApprove.child_id) : "/today"} className="btn">
          Approve lines
        </Link>
      }
      next={{ href: "/today", label: "What needs doing" }}
      rail={
        <div className="grid content-start gap-[var(--space-3)]">
          <Rail
            edges={[
              { screen: "picture", params: { class: f.class ?? classes[0] ?? "" }, label: "The class picture", icon: "class" },
              { screen: "classes", label: "Consent", icon: "form" },
            ]}
          />
          {coordinator ? (
            <aside aria-label="Consent on file" className="rounded-[var(--radius-card)] bg-[var(--surface)] p-[var(--space-3)]">
              <h2 className="mb-[var(--space-1)] text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">Consent on file</h2>
              <StackBar
                parts={[
                  { state: "done", n: onFile, words: "on file" },
                  { state: "notYet", n: noConsent, words: "missing" },
                ]}
                empty="No children counted yet"
              />
            </aside>
          ) : null}
        </div>
      }
    >
      <FilterBar
        action={HERE}
        filters={[
          { name: "class", label: "Class", value: f.class, all: "Every class", options: classes.map((c) => [c, c] as const) },
          { name: "state", label: "State", value: f.state, all: "Any state", options: STAGES.map((s) => [s, STAGE_WORDS[s]] as const) },
        ]}
      />
      <AttentionStrip
        tiles={[
          { state: "toApprove", n: waiting, sentence: coordinator ? "Lines waiting for an approval of yours." : "Your lines, not yet approved by you.", href: waitingRow ? openHref(waitingRow.child_id) : null },
          // consent is the coordinator's alone to see (the school's access rule), so an educator's strip has no consent tile
          ...(coordinator ? [{ state: "notYet" as const, n: noConsent, sentence: "Consent missing: a report cannot be sent until a parent's consent is recorded under Setup, Classes and children.", href: null }] : []),
          { state: "done", n: sent, sentence: "Reports sent this term, with both approvals and consent.", href: sent ? href({ state: "sent", open: undefined }) : null },
        ]}
      />
      {q.said ? <p role="status" className="mb-3 p-3">{q.said}</p> : null}
      {open && staged ? (
        <Details summary={`${open.roll_no} ${open.first_name}'s report lines`} open>
          <Lines r={open} lines={staged.lines} facts={facts} sent={staged.sent_at} me={me.id} coordinator={coordinator} />
        </Details>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState>No report lines drafted yet</EmptyState>
      ) : (
        <>
          <DataTable
            label="Every child's report"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.child_id}
            more={{ by: groupName, href: (name: string) => href({ state: stageOfGroup(name), open: undefined }) }}
            extras={{ expand: (r) => (totalLines(r) === 0 ? <Words r={r} /> : null) }}
          />
          <h2 className="mt-6 mb-2 text-[18px]">The same reports as a board</h2>
          <KanbanBoard lanes={lanes} />
        </>
      )}
    </Screen>
  );
}

/** A report no lines have been made from yet: the whole report's words as the engine kept them, read-only. None written shows no words. */
function Words({ r }: { r: ReportsRow }) {
  const w = r.words;
  return (
    <Details summary={`${r.first_name}'s report`}>
      {w ? (
        <div className="grid gap-2">
          <p>{w.summary}</p>
          {[...w.can_do, ...w.working_on, ...w.at_home].length ? (
            <ul className="list-disc pl-5">
              {[...w.can_do, ...w.working_on, ...w.at_home].map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          ) : null}
          {w.next_at_school ? <p>{w.next_at_school}</p> : null}
        </div>
      ) : (
        <p>Not written yet</p>
      )}
    </Details>
  );
}
