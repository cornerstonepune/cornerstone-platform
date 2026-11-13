import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { StackBar } from "@/components/stack-bar";
import type { Stat } from "@/components/stat-tile";
import { StatusChip, type State } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { grades } from "@/lib/queries";
import { engineSend } from "@/lib/engine";
import type { StagedLine } from "./lines";
import { CONSENT_WORDS, ofTotal, reportPanel } from "./report-panel";
import { lineFacts, reportsRows, seesConsent, STAGES, STAGE_WORDS, STATE_OF, stageOf, totalLines, type ReportsRow, type Stage } from "@/lib/queries-report-rows";
import { workScope } from "@/lib/reach";
import { classWords } from "@/lib/needs-you";
import type { Column } from "@/lib/ux-rules";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const HERE = "/children/reports";

// Reports (UI-8; page charter Part C, "Parent reports: keep, last", on the frame's Workspace): each child's report line by line, in the
// educator's words. Two approvals a line (an educator of the class, then a coordinator), consent on file, then sent. The left is the list,
// one table for each stage a report stands at; a child opens on the right (`?open=report:<child>&tab=…`) with its lines and their actions,
// its words and its approvals (./report-panel.tsx). With nothing chosen the right side is what waits as stat tiles and, for the coordinator,
// who alone may see consent, the consent on file as a bar. Rows are in class and Sr. No. order within a stage: no figure here is a score,
// rate, rank or ordering of a person. Not here, parked until the end (docs/notes/UI-8.md): writing the lines from a drafted report, and
// the parent's-copy PDF.
const REPORT_CHIP: Record<string, State> = { "out of date": "doNow", "to approve": "toApprove", "to write": "toDo", approved: "approved", "nothing yet": "notYet" };

/** The child the address names: `report:<id>`, or the bare id the page's links carried before it was a Workspace. */
const openedId = (v: string | undefined) => {
  const o = parseOpen(v);
  return o?.kind === "report" ? o.id : /^[0-9a-f-]{36}$/.test(v ?? "") ? v : undefined;
};

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
  const openHref = (id: string) => href({ open: `report:${id}` });

  // the one child opened (?open=), on the right: its lines staged by the engine, which also decides who may see them
  const chosen = openedId(q.open);
  const open = inClass.find((r) => r.child_id === chosen);
  const got = open?.note_id ? await engineSend("/reports/lines", { actor: me.email, note_id: open.note_id }).catch(() => null) : null;
  const staged = got?.ok ? ((await got.json()) as { lines: StagedLine[]; sent_at: string | null }) : null;
  const facts = open && staged ? await lineFacts(open.child_id, staged.lines.flatMap((l) => l.evidence)) : new Map();

  // the one main action: the first report with lines waiting to be approved (the first approval is an educator's, the second a
  // coordinator's), else the first report
  const toApprove = rows.find((r) => r.note_id && (r.lines.drafted > 0 || (coordinator && r.lines.educator > 0))) ?? rows.find((r) => r.note_id) ?? rows[0];

  // what waits, as whole counts of lines and reports for the class chosen
  const waiting = inClass.reduce((n, r) => n + r.lines.drafted + (coordinator ? r.lines.educator : 0), 0);
  const noConsent = inClass.filter((r) => r.consent && r.consent !== "given").length;
  const onFile = inClass.filter((r) => r.consent === "given").length;
  const sent = inClass.filter((r) => r.sent_at).length;
  const waitingRow = inClass.find((r) => r.note_id && (r.lines.drafted > 0 || (coordinator && r.lines.educator > 0)));
  const stats: Stat[] = [
    { id: "waiting", n: waiting, line: coordinator ? "lines waiting for an approval of yours" : "your lines, not yet approved by you", tone: waiting ? "wait" : undefined, href: waitingRow ? openHref(waitingRow.child_id) : undefined },
    // consent is the coordinator's alone to see (the school's access rule), so an educator's summary has no consent tile
    ...(coordinator ? [{ id: "consent", n: noConsent, line: "consent missing: a report cannot be sent until a parent's consent is recorded", tone: noConsent ? ("act" as const) : undefined }] : []),
    { id: "sent", n: sent, line: "reports sent this term, with both approvals and consent", href: sent ? href({ state: "sent", open: undefined }) : undefined },
  ];

  const columns: Column<ReportsRow>[] = [
    {
      key: "child",
      label: "Sr. No. and name",
      value: (r) => `${r.roll_no} ${r.first_name}`,
      cell: (r) => (
        <>
          <span className="num">{r.roll_no}</span>{" "}
          <Link href={openHref(r.child_id)} scroll={false} data-open-key={`report:${r.child_id}`} aria-expanded={open?.child_id === r.child_id} className={open?.child_id === r.child_id ? "font-semibold" : undefined}>
            {r.first_name}
          </Link>
        </>
      ),
    },
    { key: "class", label: "Class", width: "7rem", value: (r) => classWords(g, r.band, r.section) },
    {
      key: "lines",
      label: "Lines",
      width: "11rem",
      value: (r) => (totalLines(r) ? `${totalLines(r)} lines` : STATE_OF(r)),
      // a report with lines: how many (their words and actions are the child's panel); one without: its whole-report state in words
      cell: (r) => (totalLines(r) ? `${totalLines(r)} ${totalLines(r) === 1 ? "line" : "lines"}` : <StatusChip state={REPORT_CHIP[STATE_OF(r)]} words={STATE_OF(r)} />),
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

  const groupName = (r: ReportsRow) => `${STAGE_WORDS[stageOf(r)]} · ${rows.filter((x) => stageOf(x) === stageOf(r)).length}`;
  const stageOfGroup = (name: string) => STAGES.find((s) => name.startsWith(`${STAGE_WORDS[s]} · `));
  const panel = open ? reportPanel(open, { className: classWords(g, open.band, open.section), staged, facts, me: me.id, coordinator, closeHref: href({ open: undefined }), tab: q.tab }) : null;
  const summary = {
    title: "What waits",
    stats,
    after: (
      <>
        {coordinator ? (
          <section aria-label="Consent on file" className="grid gap-[var(--space-1)]">
            <h3 className="b-label b-muted">Consent on file</h3>
            <StackBar
              parts={[
                { state: "done", n: onFile, words: "on file" },
                { state: "notYet", n: noConsent, words: "missing" },
              ]}
              empty="No children counted yet"
            />
          </section>
        ) : null}
        <p className="b-label b-muted">Choose a child to read and approve their report here.</p>
      </>
    ),
  };

  return (
    <Screen
      stage={`${f.class ? classWords(g, inClass[0]?.band ?? "", f.class) : "Every class"} · this term · ${inClass.length} ${inClass.length === 1 ? "child" : "children"}`}
      title="Reports"
      purpose="Each child's report, line by line, in the educator's words. Choose a child to read and approve it on the right; nothing goes out until it is approved and consent is on file."
      action={
        <Link href={toApprove ? openHref(toApprove.child_id) : "/today"} className="btn">
          Approve lines
        </Link>
      }
      next={{ href: "/today", label: "Today" }}
      panel={<DetailPanel open={panel} summary={summary} />}
    >
      <FilterBar
        action={HERE}
        filters={[
          { name: "class", label: "Class", value: f.class, all: "Every class", options: classes.map((c) => [c, c] as const) },
          { name: "state", label: "State", value: f.state, all: "Any state", options: STAGES.map((s) => [s, STAGE_WORDS[s]] as const) },
        ]}
      />
      {q.said ? (
        <p role="status" className="mb-3 p-3">
          {q.said}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState>No report lines drafted yet</EmptyState>
      ) : (
        <DataTable
          label="Every child's report"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.child_id}
          more={{ by: groupName, href: (name: string) => href({ state: stageOfGroup(name), open: undefined }) }}
          extras={{ attrs: (r) => ({ "data-child": r.child_id }) }}
        />
      )}
    </Screen>
  );
}
