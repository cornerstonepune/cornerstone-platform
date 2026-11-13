import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
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
import { readerReport } from "@/lib/queries-read";
import { across } from "@/lib/queries-across";
import { grades } from "@/lib/queries";
import { classWords } from "@/lib/needs-you";
import { chosenNames, fileLinks } from "@/lib/queries-assessment-extras";
import { assessmentList, KIND_WORDS, paperFilters, paperList, type PaperFilter } from "@/lib/queries-papers";
import { assessmentHref, laneOf, LANES, openIdOf, paperHref, STAGE_WORDS, waitsFor } from "@/lib/assessment-ui";
import { sigsFor } from "@/lib/assessment-steps";
import { dateWords, weekWords } from "@/lib/week";
import { deadline } from "@/lib/deadline";
import type { Column } from "@/lib/ux-rules";
import { assessmentKey, type Named } from "./assessment-key";
import { namedRows } from "./named";
import { countsOf } from "./step-counts";
import { topicGroups, topicNamesOf } from "@/lib/queries-by-topic";
import { ScansTable } from "./reading/scans-table";
import { ReaderPanel } from "./reading/reader-panel";
import { READER_VIEWS, type ReaderView } from "./reading/reader-table";
import { assessmentPanel } from "./assessment-panel";
import { ReadSaid } from "./upload/read-box";
import { MakeCard } from "./make-card";
import { RenameForm } from "./rename-form";
import { TopicView } from "./topic-view";
import { Maker } from "./maker";

type Props = { searchParams: Promise<Record<string, string | undefined>> };
const UUID = /^[0-9a-f-]{36}$/;
const HERE = "/children/assessments";

// Assessments, a Board (page charter B6): move each assessment from made to results, and see what is stuck. Four lanes by who has the
// paper, each card an assessment (topic and class, its date and how many papers are back, one chip, one next action). Choosing a card opens
// the assessment on the right in tabs (Copies · Upload · Check · Results), the address carrying it (`open=assessment:<id>`); with nothing
// chosen the right side is three numbers. Uploading happens on the assessment's Upload tab: the Upload papers page is retired.
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
  const byTopic = q.view === "topic";
  const reading = q.view === "reading";
  // by topic, no topic narrows the list: each topic is a group of its own, and only the open one's rows are read, a page of them
  const listFilter = byTopic ? { ...sql, topic: undefined } : sql;
  const [{ rows: all, more }, { options }, scans, g, { subjects }] = await deadline(
    Promise.all([
      byTopic || reading ? Promise.resolve({ rows: [] as Awaited<ReturnType<typeof assessmentList>>["rows"], more: false, total: 0 }) : assessmentList(sql, me, status ? { limit: 300, offset: 0, sigs: sigsFor(status as never) } : undefined),
      paperFilters(me), lastScans(me), grades(), choices(),
    ]),
  );
  const topicList = byTopic ? await deadline(topicGroups(listFilter, me)) : [];
  const openTopic = topicList.find((x) => x.code === q.t)?.code;
  const topicPage = Math.max(1, Math.floor(Number(q.page)) || 1);
  const opened = openTopic
    ? await deadline(assessmentList({ ...listFilter, topic: openTopic }, me, { limit: 10, offset: (topicPage - 1) * 10, sigs: status ? sigsFor(status as never) : undefined }))
    : null;
  if (opened) all.push(...opened.rows);
  const reader = reading ? await deadline(readerReport()) : null;
  const readerView: ReaderView = READER_VIEWS.some(([v]) => v === q.reader) ? (q.reader as ReaderView) : "day";
  all.sort((a, b) => (a.week && b.week ? b.week.localeCompare(a.week) : a.week ? -1 : b.week ? 1 : 0));
  const keys = all.map((a) => ({ key: assessmentKey(a), qrs: a.qrs ?? [] }));
  const [chosen, files] = await deadline(Promise.all([chosenNames(keys.map((k) => k.key)), fileLinks(keys, me)]));
  const topicNames = new Map((await deadline(topicNamesOf())).map((t) => [t.code, t.name]));
  const named: Named[] = namedRows(all, { g, topicName: (c) => topicNames.get(c) ?? c, chosen, files: files.byKey });
  // a replaced assessment (every copy replaced by a newer one) has no next step and no row here
  const rows = named
    .map((a) => ({ a, key: assessmentKey(a), counts: countsOf(a), w: waitsFor(countsOf(a), a.waiting) }))
    .filter((r) => r.w.action.kind !== "none")
    .filter((r) => !status || r.w.action.kind === status);
  type Row = (typeof rows)[number];

  // the address as it stands, with some parameters changed (undefined removes one): the panel's open, close and tab links keep the filters
  const at = (over: Record<string, string | undefined>) => {
    const kept: Record<string, string | undefined> = { ...q, said: undefined, read: undefined, why: undefined, pages: undefined, ...over };
    const p = new URLSearchParams(Object.entries(kept).filter((e): e is [string, string] => !!e[1]));
    return p.size ? `${HERE}?${p}` : HERE;
  };
  const openOf = (r: Row) => `assessment:${openIdOf(r.key)}`;
  const openAt = (r: Row, tab?: string) => at({ open: openOf(r), tab });
  // the one next action: approving and printing are on the assessment's own page; every other step is a tab of its panel
  const nextOf = (r: Row) => {
    const k = r.w.action.kind;
    const href = k === "approve" || k === "print" ? assessmentHref(r.key) : openAt(r, k === "upload" ? "upload" : k === "results" ? "results" : k === "reading" ? "copies" : "check");
    return { href, label: r.w.action.label };
  };
  const titleOf = (r: Row) => {
    const topic = r.a.topics.map((c) => topicNames.get(c) ?? c).join(" · ") || r.a.title;
    const klass = r.a.band && r.a.section ? classWords(g, r.a.band, r.a.section) : (r.a.section ?? (r.a.band ? g.name(r.a.band) : ""));
    return [topic, klass].filter(Boolean).join(" · ");
  };
  const papersBack = (a: Named) => `${a.by.scanned + a.by.checked + a.by["signed off"]} of ${a.copies} papers back`;
  const lineOf = (r: Row) => `${r.a.day ? dateWords(r.a.day) : weekWords(r.a.week)} · ${papersBack(r.a)}`;

  // the panel: the assessment the address opens, else the page's three numbers
  const want = parseOpen(q.open);
  const chosenRow = want?.kind === "assessment" ? rows.find((r) => openIdOf(r.key) === want.id) : undefined;
  const panelOpen: Opened | null = chosenRow
    ? await assessmentPanel(
        me,
        { key: chosenRow.key, openKey: openOf(chosenRow), title: chosenRow.a.name, line: lineOf(chosenRow), files: chosenRow.a.files, next: nextOf(chosenRow) },
        chosenRow.a,
        { closeHref: at({ open: undefined, tab: undefined }), here: at({ tab: undefined }), tab: q.tab, read: q.read, why: q.why, pages: q.pages, reading: scans.some((s) => s.status === "running") },
      )
    : null;
  const sum = (n: (r: Row) => number) => rows.reduce((s, r) => s + n(r), 0);
  const toCheck = sum((r) => r.a.by.scanned + r.a.by.checked);
  const toJudge = sum((r) => r.a.waiting);
  // the right side is the Board's and the Table's (page charter B6); the Reading and By topic views hold no rows of their own to count
  const panelShown = !reading && !byTopic;
  const overdue = panelShown && !chosenRow ? await deadline(across(me.email, me)) : null;
  const late = overdue ? overdue.overdue.reduce((s, o) => s + o.papers, 0) : 0;
  // where the answers-to-judge tile lands: the first paper with answers waiting for a person
  const judging = rows.find((r) => r.w.action.kind === "check" && r.a.waiting > 0);
  let judgeHref = `${HERE}?status=check`;
  if (judging && panelShown && !chosenRow) {
    const copies = await deadline(paperList({ kind: judging.a.kind, class: judging.a.section || undefined, week: judging.a.week || undefined, set: judging.a.set || undefined }, me.email, me, "roll"));
    const p = copies.rows.find((c) => c.waiting > 0 && c.roll_no);
    judgeHref = p?.roll_no ? paperHref(judging.key, p.roll_no) : openAt(judging, "check");
  }

  const mainRow = judging ?? rows[0];
  const cards: KCard[] = rows.map((r) => ({
    key: r.key,
    kind: "assessment",
    title: titleOf(r),
    sub: lineOf(r),
    href: openAt(r),
    state: r.w.state,
    words: r.w.words,
    main: r.key === mainRow?.key,
    openKey: openOf(r),
    selected: r.key === chosenRow?.key,
    attrs: { "data-assessment-card": openIdOf(r.key) },
    action: { ...nextOf(r), attrs: { "data-card-next": "" } },
  }));
  const lanes = LANES.map((l) => {
    const mine = cards.filter((_, i) => laneOf(rows[i].w.action.kind)?.key === l.key);
    return { key: l.key, label: l.label, state: l.state, count: mine.length, empty: l.empty, cards: mine };
  });
  const view = byTopic ? "topic" : reading ? "reading" : q.view === "table" ? "table" : "board";
  const view_ = (v: string) => `${HERE}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(q).filter(([k, x]) => x && !["view", "page", "open", "tab"].includes(k))) as Record<string, string>, view: v })}`;
  /** The By topic view as addressed now, with some parameters changed (undefined removes one): each appears once. */
  const topicAt = (over: Record<string, string | undefined>) =>
    `${HERE}?${new URLSearchParams(Object.entries({ ...q, view: "topic", said: undefined, ...over }).filter(([, v]) => v) as [string, string][])}`;
  const subjectWords = new Map(subjects.map((x) => [x.code, x.label] as const));

  const columns: Column<Row>[] = [
    { key: "name", label: "Assessment", value: (r) => r.a.name, cell: (r) => (
        <>
          <Link href={assessmentHref(r.key)} data-assessment-row="">{r.a.name}</Link>
          <RenameForm assessmentKey={r.key} name={r.a.name} back={view_("table")} />
        </>
      ),
    },
    { key: "class", label: "Class", width: "7rem", value: (r) => [r.a.band ? g.name(r.a.band) : null, r.a.section].filter(Boolean).join(" · ") },
    { key: "back", label: "Papers back", num: true, width: "8rem", value: (r) => `${r.a.by.printed + r.a.by.scanned + r.a.by.checked + r.a.by["signed off"]} of ${r.a.copies}` },
    { key: "waits", label: "Waits for", status: true, width: "13rem", value: (r) => r.w.words, cell: (r) => <StatusChip state={r.w.state} words={r.w.words} /> },
    {
      key: "next",
      label: "Next",
      status: true,
      width: "11rem",
      value: (r) => r.w.action.label,
      cell: (r) => (
        <Link href={r.key === mainRow?.key && r.w.action.kind === "check" ? judgeHref : assessmentHref(r.key)} className={`btn ${r.key === mainRow?.key ? "" : "secondary"}`} data-assessment-next="">
          {r.w.action.label}
        </Link>
      ),
    },
  ];

  return (
    <Screen
      stage="Grades 1 to 4 · your classes"
      title="Assessments"
      purpose="Move each assessment from made to results, and see what is stuck. Choose a card to see its copies, upload its papers and check them."
      next={{ href: "/children", label: "Children" }}
      action={<MakeCard />}
      panel={panelShown ? (
        <DetailPanel
          open={panelOpen}
          summary={{
            title: "What waits",
            stats: [
              { id: "to-check", n: toCheck, line: toCheck === 1 ? "paper waiting to check" : "papers waiting to check", tone: toCheck ? "wait" : undefined, href: `${HERE}?status=check` },
              { id: "to-judge", n: toJudge, line: toJudge === 1 ? "answer to judge" : "answers to judge", tone: toJudge ? "act" : undefined, href: judgeHref },
              { id: "overdue", n: late, line: `${late === 1 ? "paper" : "papers"} with checks overdue (over ${overdue?.hours ?? 0} hours)`, tone: late ? "act" : undefined, href: "/across" },
            ],
            after: <p className="b-label b-muted">Choose an assessment on the board to see it here.</p>,
          }}
        />
      ) : undefined}
    >
      {q.said ? <p role="status" className="mb-3 p-3">{q.said}</p> : null}
      <FilterBar
        action={HERE}
        keep={{ view: q.view, t: byTopic ? q.t : undefined }}
        filters={[
          // page charter B6: Class, Subject and Week in the row; Topic, Kind and Stage behind "More filters"
          { name: "class", label: "Class", value: f.class, all: "Every class", options: options.classes.map((c) => [c, c] as const) },
          { name: "subject", label: "Subject", value: f.subject, all: "Every subject", options: subjects.map((s) => [s.code, s.label] as const) },
          { name: "week", label: "Week", value: f.week, all: "Every week", options: options.weeks.map((w) => [w, weekWords(w)] as const) },
          { name: "topic", label: "Topic", value: f.topic, all: "Every topic", options: taught.map((x) => [x.code, x.name] as const) },
          { name: "kind", label: "Kind", value: f.kind, all: "Any kind", options: Object.entries(KIND_WORDS) },
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
            { key: "topic", label: "By topic", icon: "table", href: view_("topic") },
            { key: "reading", label: "Reading", icon: "table", href: view_("reading") },
          ]}
        />
      </div>
      {reading ? (
        <>
          {reader ? <ReaderPanel r={reader} view={readerView} page={Math.max(1, Math.floor(Number(q.rpage)) || 1)} keep={{ view: "reading" }} base={HERE} /> : null}
          {scans.length ? (
            <section aria-label="Read a scan" id="read-scan" className="mt-4" data-files-read>
              <h2 className="mb-2">Files read lately, and what each lacks ({scans.length})</h2>
              <ReadSaid read={q.read} why={q.why} pages={q.pages} />
              <ScansTable
                scans={scans}
                from={view_("reading")}
                belongs={(file) => {
                  // the assessments the file's printed codes belong to, else a plain word that it belongs to none
                  const mine = named.filter((a) => files.byKey.get(assessmentKey(a))?.includes(file));
                  return mine.length ? (
                    mine.map((a) => (
                      <Link key={assessmentKey(a)} href={assessmentHref(assessmentKey(a))} className="block">{a.name}</Link>
                    ))
                  ) : (
                    <span className="text-terracotta" data-unmatched="">{files.unmatched.includes(file) ? "Not matched to an assessment" : "No assessment of yours"}</span>
                  );
                }}
              />
            </section>
          ) : (
            <EmptyState>No file has been read yet. Upload one on an assessment&rsquo;s Upload tab and it appears here.</EmptyState>
          )}
        </>
      ) : byTopic ? (
        <>
          <TopicView
            groups={topicList}
            subjects={subjectWords}
            open={openTopic}
            rows={rows.map((r) => ({ key: r.key, name: r.a.name, klass: [r.a.band ? g.name(r.a.band) : null, r.a.section].filter(Boolean).join(" · "), back: HERE, state: r.w.state, words: r.w.words, next: r.w.action.label }))}
            of={opened?.total ?? 0}
            page={topicPage}
            topicPage={Math.max(1, Math.floor(Number(q.tp)) || 1)}
            topicHref={(code, isOpen) => topicAt({ t: isOpen ? undefined : code, page: undefined })}
            assessmentsPageHref={(n) => topicAt({ page: String(n) })}
            topicsPageHref={(n) => topicAt({ tp: String(n), t: undefined, page: undefined })}
          />
          {topicList.length === 0 ? <EmptyState>No assessments yet.</EmptyState> : null}
        </>
      ) : rows.length === 0 ? (
        <EmptyState>
          <Icon name="assessment" size={ICON_SIZE.row} /> No assessments yet. Make one with “Make an assessment” above, and it appears here at To approve and print.
        </EmptyState>
      ) : view === "board" ? (
        <KanbanBoard lanes={lanes} />
      ) : (
        <DataTable label="Every assessment" columns={columns} rows={rows} rowKey={(r) => r.key} extras={{ attrs: (r) => ({ "data-assessment": r.key }) }} more={{ page: Math.max(1, Math.floor(Number(q.page)) || 1), href: (n: number) => `${view_("table")}&page=${n}` }} />
      )}
      {more ? <p className="note mt-2">The newest 300 assessments are shown; narrow the filters to see the rest.</p> : null}
    </Screen>
  );
}
