import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { AttentionStrip } from "@/components/attention-strip";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KanbanBoard, ViewToggle, type KCard } from "@/components/kanban-board";
import { StatusChip } from "@/components/status-chip";
import { ICON_SIZE, Icon } from "@/lib/icons";
import { requireStaff } from "@/lib/auth";
import { choices } from "@/lib/choices";
import { scopeOf } from "@/lib/scope";
import { lastScans } from "@/lib/queries-scans";
import { topics } from "@/lib/queries-people";
import { grades } from "@/lib/queries";
import { chosenNames, fileLinks } from "@/lib/queries-assessment-extras";
import { assessmentList, KIND_WORDS, paperFilters, paperList, type PaperFilter } from "@/lib/queries-papers";
import { assessmentHref, laneOf, LANES, paperHref, STAGE_WORDS, tiles, waitsFor } from "@/lib/assessment-ui";
import { actionOf, sigsFor } from "@/lib/assessment-steps";
import { weekWords } from "@/lib/week";
import { deadline } from "@/lib/deadline";
import type { Column } from "@/lib/ux-rules";
import { assessmentKey, type Named } from "../../papers/assessments-table";
import { ghostRow, namedRows } from "../../papers/named";
import { countsOf } from "../../papers/step-columns";
import { ReadBox } from "../../papers/read-box";
import { topicNamesOf } from "@/lib/queries-by-topic";
import { MakeCard } from "./make-card";
import { Maker } from "./maker";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const UUID = /^[0-9a-f-]{36}$/;
const HERE = "/children/assessments";

// Assessments: each one goes through seven steps; its row shows the step it waits at and the one thing to do next. The
// tiles, the board's lanes and the table all count the same rows (the queries and the seven steps are unchanged).
export default async function AssessmentsPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  if (q.make) return <Maker way={q.make} q={q} me={me} />;
  const scope = scopeOf(me);
  const taught = (await deadline(topics(scope))).filter((t) => t.shown);
  const f: PaperFilter & { status?: string } = {
    class: q.class || undefined,
    child: q.child && UUID.test(q.child) ? q.child : undefined,
    kind: q.kind && q.kind in KIND_WORDS ? q.kind : undefined,
    week: q.week || undefined,
    topic: taught.some((t) => t.code === q.topic) ? q.topic : undefined,
    subject: q.subject || undefined,
    q: q.q?.trim() || undefined,
    status: q.status && q.status in STAGE_WORDS ? q.status : undefined,
  };
  const { status, ...sql } = f;
  const [{ rows: all, more }, { options }, scans, g, { subjects }] = await deadline(
    Promise.all([assessmentList(sql, me, status ? { limit: 300, offset: 0, sigs: sigsFor(status as never) } : undefined), paperFilters(me), lastScans(me), grades(), choices()]),
  );
  all.sort((a, b) => (a.week && b.week ? b.week.localeCompare(a.week) : a.week ? -1 : b.week ? 1 : 0));
  const keys = all.map((a) => ({ key: assessmentKey(a), qrs: a.qrs ?? [] }));
  const [chosen, files] = await deadline(Promise.all([chosenNames(keys.map((k) => k.key)), fileLinks(keys, me)]));
  const topicNames = new Map((await deadline(topicNamesOf())).map((t) => [t.code, t.name]));
  const named: Named[] = namedRows(all, { g, topicName: (c) => topicNames.get(c) ?? c, chosen, files: files.byKey });
  void ghostRow;
  // a replaced assessment (every copy replaced by a newer one) has no next step and no row here
  const rows = named
    .map((a) => ({ a, key: assessmentKey(a), counts: countsOf(a), w: waitsFor(countsOf(a), a.waiting) }))
    .filter((r) => r.w.action.kind !== "none")
    .filter((r) => !status || r.w.action.kind === status);
  const t = tiles(rows.map((r) => ({ counts: r.counts, waiting: r.a.waiting })));

  // where a tile lands: the first assessment it counts, and for do-now its first paper with answers to judge
  const first = (pred: (r: (typeof rows)[number]) => boolean) => rows.find(pred);
  const judging = first((r) => r.w.action.kind === "check" && r.a.waiting > 0);
  let judgeHref = `${HERE}?status=check`;
  if (judging) {
    const copies = await deadline(paperList({ kind: judging.a.kind, class: judging.a.section || undefined, week: judging.a.week || undefined, set: judging.a.set || undefined }, me.email, me, "roll"));
    const p = copies.rows.find((c) => c.waiting > 0 && c.roll_no);
    judgeHref = p?.roll_no ? paperHref(judging.key, p.roll_no) : assessmentHref(judging.key);
  }
  const week = first((r) => r.w.action.kind === "approve" || r.w.action.kind === "signoff");
  const done = first((r) => r.w.action.kind === "results");
  const mainRow = judging ?? week ?? rows[0];
  const view = q.view === "table" ? "table" : "board";
  const view_ = (v: string) => `${HERE}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter(([k, x]) => x && k !== "view" && k !== "page")) as Record<string, string>, view: v })}`;
  const subjectWords = new Map(subjects.map((x) => [x.code, x.label] as const));
  void subjectWords;
  const papersBack = (a: Named) => `${a.by.printed + a.by.scanned + a.by.checked + a.by["signed off"]} of ${a.copies}`;

  const cards: KCard[] = rows.map((r) => ({
    key: r.key,
    kind: "assessment",
    title: r.a.name,
    sub: `${r.a.band ? g.name(r.a.band) : ""}${r.a.section ? ` · ${r.a.section}` : ""} · ${papersBack(r.a)} papers back · Next: ${r.w.action.label}`,
    href: assessmentHref(r.key),
    state: r.w.state,
    note: r.w.words,
    main: r.key === mainRow?.key,
  }));
  const lanes = LANES.map((l) => {
    const mine = cards.filter((_, i) => laneOf(rows[i].w.action.kind)?.key === l.key);
    return { key: l.key, label: l.label, state: l.state, count: mine.length, empty: l.empty, cards: mine };
  });

  const columns: Column<(typeof rows)[number]>[] = [
    { key: "name", label: "Assessment", value: (r) => r.a.name, cell: (r) => <Link href={assessmentHref(r.key)} data-assessment-row="">{r.a.name}</Link> },
    { key: "class", label: "Class", width: "7rem", value: (r) => [r.a.band ? g.name(r.a.band) : null, r.a.section].filter(Boolean).join(" · ") },
    { key: "back", label: "Papers back", num: true, width: "8rem", value: (r) => papersBack(r.a) },
    { key: "waits", label: "Waits for", status: true, width: "13rem", value: (r) => r.w.words, cell: (r) => <StatusChip state={r.w.state} words={r.w.words} /> },
    {
      key: "next",
      label: "Next",
      status: true,
      width: "11rem",
      value: (r) => r.w.action.label,
      cell: (r) => (
        <Link href={r.key === mainRow?.key ? paperOrAssessment(r.key, mainRow, judgeHref) : assessmentHref(r.key)} className={`btn ${r.key === mainRow?.key ? "" : "secondary"}`} data-assessment-next="" data-ux={r.key === mainRow?.key ? "action" : undefined}>
          {r.w.action.label}
        </Link>
      ),
    },
  ];
  const trouble = scans.some((s) => s.status === "error" || s.noCode.length || s.lines.length);
  void trouble;
  const empty = rows.length === 0;

  return (
    <Screen
      stage="Grades 1 to 4 · your classes"
      title="Assessments"
      purpose="Each one goes through seven steps. Its row shows the step it waits at and the one thing to do next."
      rail={
        <Rail
          edges={[
            ...(judging ? [{ screen: "paper", href: judgeHref, label: "Answers to check", icon: "correct" as const }] : []),
            ...(week && week.w.action.kind === "approve" ? [{ screen: "assessment", href: assessmentHref(week.key), label: "Pack to approve", icon: "assessment" as const }] : []),
            ...(done ? [{ screen: "child", params: { id: "" }, label: "A child with results in", icon: "child" as const }] : []),
            { screen: "skill", params: { code: "" }, label: "The skills tested", icon: "skill" },
            { screen: "bank", label: "Question bank", icon: "skill" },
          ]}
        />
      }
    >
      <AttentionStrip
        tiles={[
          { state: "doNow", n: t.doNow, sentence: "Assessments with answers for you to judge.", href: judgeHref },
          { state: "doSoon", n: t.thisWeek, sentence: "Packs to approve and papers to sign off.", href: week ? assessmentHref(week.key) : `${HERE}?status=approve` },
          { state: "done", n: t.done, sentence: "Assessments with every paper confirmed.", href: done ? assessmentHref(done.key) : `${HERE}?status=results` },
        ]}
      />
      <div className="my-4 grid items-stretch gap-4 lg:grid-cols-2" data-block="Cards">
        <MakeCard main={!mainRow} />
        <ReadBox read={q.read} why={q.why} pages={q.pages} reading={scans.some((s) => s.status === "running")} from={HERE} />
      </div>
      {q.said ? <p role="status" className="mb-3 p-3">{q.said}</p> : null}
      <FilterBar
        action={HERE}
        keep={{ view: q.view }}
        filters={[
          { name: "class", label: "Class", value: f.class, all: "Every class", options: options.classes.map((c) => [c, c] as const) },
          { name: "topic", label: "Topic", value: f.topic, all: "Every topic", options: taught.map((x) => [x.code, x.name] as const) },
          { name: "subject", label: "Subject", value: f.subject, all: "Every subject", options: subjects.map((s) => [s.code, s.label] as const) },
          { name: "kind", label: "Kind", value: f.kind, all: "Any kind", options: Object.entries(KIND_WORDS) },
          { name: "week", label: "Week", value: f.week, all: "Every week", options: options.weeks.map((w) => [w, weekWords(w)] as const) },
          { name: "status", label: "Stage", value: f.status, all: "Any stage", options: Object.entries(STAGE_WORDS) },
        ]}
        search={{ name: "q", value: f.q, placeholder: "Find an assessment" }}
      />
      <div className="mb-3">
        <ViewToggle
          current={view}
          views={[
            { key: "board", label: "Board", icon: "board", href: view_("board") },
            { key: "table", label: "Table", icon: "table", href: view_("table") },
          ]}
        />
      </div>
      {empty ? (
        <EmptyState>
          <Icon name="assessment" size={ICON_SIZE.row} /> No assessments yet. Make one with a button under “Make an assessment” above, and it appears here at Created.
        </EmptyState>
      ) : view === "board" ? (
        <KanbanBoard lanes={lanes} />
      ) : (
        <DataTable label="Every assessment" columns={columns} rows={rows} rowKey={(r) => r.key} more={{ page: Math.max(1, Math.floor(Number(q.page)) || 1), href: (n: number) => `${view_("table")}&page=${n}` }} />
      )}
      {more ? <p className="note mt-2">The newest 300 assessments are shown; narrow the filters to see the rest.</p> : null}
    </Screen>
  );
}

/** The main action's address: the paper with answers to judge when that is what is next, else the assessment's own. */
function paperOrAssessment(key: string, row: { w: { action: { kind: string } } }, judgeHref: string) {
  return row.w.action.kind === "check" ? judgeHref : assessmentHref(key);
}

void actionOf;
