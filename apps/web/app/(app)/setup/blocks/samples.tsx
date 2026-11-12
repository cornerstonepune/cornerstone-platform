import { AppFrame } from "@/components/app-frame";
import { BrandMark } from "@/components/brand-mark";
import type { Session } from "@/lib/auth";
import { AttentionStrip } from "@/components/attention-strip";
import { Cards } from "@/components/cards";
import { StatTiles } from "@/components/stat-tile";
import { DetailPanel } from "@/components/detail-panel";
import { SubjectMix, SubjectTag } from "@/components/subject-tag";
import { levelState, scaleLook } from "@/lib/state-scale";
import { CaptureBar } from "@/components/capture-bar";
import { ChildGraph } from "@/components/child-graph";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { DropZone } from "@/components/drop-zone";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { Form } from "@/components/form";
import { FortnightGrid } from "@/components/fortnight-grid";
import { HeatGrid } from "@/components/heat-grid";
import { KeyValue } from "@/components/key-value";
import { KindLink, KindTile, KINDS } from "@/components/kind-tile";
import { LevelBars } from "@/components/level-bars";
import { PageImage } from "@/components/page-image";
import { PeriodRow } from "@/components/period-row";
import { Spark } from "@/components/spark";
import { StackBar } from "@/components/stack-bar";
import { Stepper } from "@/components/stepper";
import { EMERGING, PRACTISING, SECURE, StatusChip, type State } from "@/components/status-chip";
import { Timeline } from "@/components/timeline";
import { Trend } from "@/components/trend";
import { KanbanBoard, ViewToggle } from "@/components/kanban-board";
import { GridSample } from "./grid-sample";
import { PeekSample } from "./peek-sample";

// Sample data for every block: it lives here, never in a database row. Names are from the fake-names list
// (docs/frontend/wireframes/fake-names.json): the repository is public.
const KIND_WORDS: Record<(typeof KINDS)[number], string> = { period: "Period", child: "Child", activity: "Activity", objective: "Objective", skill: "Skill", assessment: "Assessment", note: "Note" };
const CLASSES = [
  { name: "K2 Red", children: 24, state: "toConfirm" as State, note: "3 to confirm" },
  { name: "K2 Blue", children: 23, state: "done" as State, note: "" },
];

export function sampleOf(name: string, q: Record<string, string | undefined>, me: Session): React.ReactNode | null {
  switch (name) {
    case "AttentionStrip":
      return <AttentionStrip tiles={[
        { state: "doNow", n: 2, sentence: "Notes past 48 hours, still to confirm.", href: "/setup/blocks?open=AttentionStrip" },
        { state: "doSoon", n: 5, sentence: "Notes waiting for you to confirm.", href: "/setup/blocks?open=AttentionStrip" },
        { state: "done", n: 11, sentence: "Periods taught and confirmed this week.", href: "/setup/blocks?open=AttentionStrip" },
      ]} />;
    case "PeriodRow":
      return <PeriodRow periods={[
        { time: "08:30", subject: "fixed", name: "Settling in", href: "/setup/blocks?open=PeriodRow" },
        { time: "08:45", subject: "numeracy", name: "Counting in tens with bundles", fact: "Numeracy · note confirmed", state: "done", href: "/setup/blocks?open=PeriodRow" },
        { time: "09:30", subject: "language", name: "Story circle: the lost mitten", fact: "Language · now", state: "toDo", now: true, href: "/setup/blocks?open=PeriodRow" },
      ]} />;
    case "StatusChip":
      return (
        <div className="b-keyrow">
          {(["overdue", "toConfirm", "done", "toDo"] as State[]).map((s) => <StatusChip key={s} state={s} round />)}
          <StatusChip state="moved" onTint round />
        </div>
      );
    case "DataTable":
      return <DataTable label="Sample classes" rowKey={(r) => r.name} rows={CLASSES} more={{ page: 1, href: () => "/setup/blocks?open=DataTable" }} columns={[
        { key: "class", label: "Class", value: (r) => r.name, cell: (r) => <a href="/setup/blocks?open=DataTable">{r.name}</a> },
        { key: "n", label: "Children", value: (r) => r.children, num: true },
        { key: "notes", label: "Notes", value: (r) => r.state, status: true, cell: (r) => <StatusChip state={r.state} words={r.note || undefined} round /> },
      ]} />;
    case "FilterBar":
      return (
        <FilterBar
          action="/setup/blocks"
          keep={{ open: "FilterBar" }}
          filters={[
            { name: "class", label: "Class", value: q.class, all: "All", options: [["K2 Red", "K2 Red"], ["K2 Blue", "K2 Blue"]] },
            { name: "week", label: "Week", value: q.week, all: "Any week", options: [["A", "Week A"], ["B", "Week B"]] },
            { name: "state", label: "State", value: q.state, all: "Any state", options: [["late", "Late"], ["done", "Done"]] },
            { name: "kind", label: "Kind", value: q.kind, all: "Any kind", options: [["class", "For a class"], ["child", "For a child"]] },
          ]}
          search={{ name: "find", value: q.find, placeholder: "Search this table" }}
        />
      );
    case "ClassGrid":
      return <div className="b-sample"><GridSample mode="button" /><GridSample mode="link" /></div>;
    case "Stepper":
      return <Stepper label="Sample steps" steps={[{ state: "done", words: "Printed" }, { state: "done", words: "Scanned" }, { state: "overdue", words: "Marking late" }, { state: "toApprove", words: "To approve" }, { state: "toDo", words: "Sent home" }]} />;
    case "Details":
      return <Details summary="What the note said">Counted 20 bundles of ten and said how many without recounting.</Details>;
    case "Timeline":
      return <Timeline entries={[
        { kind: "note", title: "Voice note, confirmed", line: "Counts on from 30 in tens, with bundles.", when: "18-Nov · voice", more: "Counted on from 30 in tens, using the bundles." },
        { kind: "assessment", title: "Paper, sheet 3", line: "4 right, 1 wrong with working, 1 blank.", when: "20-Nov · paper" },
      ]} />;
    case "ChildGraph":
      return <ChildGraph initials="AA" skills={[
        { name: "Counting in tens", state: SECURE, seen: 5, domain: "numeracy", href: "/setup/blocks?open=ChildGraph" },
        { name: "Sharing equally", state: PRACTISING, seen: 2, domain: "numeracy", href: "/setup/blocks?open=ChildGraph" },
        { name: "Retelling", state: PRACTISING, seen: 3, domain: "language", href: "/setup/blocks?open=ChildGraph" },
        { name: "Clay shapes", state: "notSeenYet", seen: 0, domain: "arts", href: "/setup/blocks?open=ChildGraph" },
      ]} />;
    case "StackBar":
      return <StackBar parts={[{ state: SECURE, n: 10 }, { state: PRACTISING, n: 7 }, { state: EMERGING, n: 4 }, { state: "notSeenYet", n: 3 }]} />;
    case "LevelBars":
      return <LevelBars levels={[{ level: 0, n: 3 }, { level: 1, n: 10 }, { level: 2, n: 8 }, { level: 3, n: 3 }]} />;
    case "Spark":
      return <Spark label="Secure" values={[2, 3, 5, 6, 9, 11]} />;
    case "Trend":
      return <Trend sittings={[{ date: "2026-08-04", level: 0 }, { date: "2026-09-08", level: 1 }, { date: "2026-10-13", level: 1 }, { date: "2026-11-18", level: 2 }]} />;
    case "HeatGrid":
      return <HeatGrid days={["Mon", "Tue", "Wed"]} rows={[{ label: "K2 Red", cells: ["done", "moved", "notDone"] }, { label: "K2 Blue", cells: ["done", "done", "holiday"] }]} />;
    case "FortnightGrid":
      return <FortnightGrid days={["Mon 16", "Tue 17", "Wed 18"]} today="Tue 17" rows={[
        { band: "Settling in · 08:30" },
        { time: "08:45", cells: [
          { subject: "numeracy", activity: "Counting in tens", href: "/setup/blocks?open=FortnightGrid", chip: "done" },
          { subject: "language", activity: "Story circle", href: "/setup/blocks?open=FortnightGrid", chip: "toConfirm", now: true },
          { subject: "arts", activity: "Leaf printing", href: "/setup/blocks?open=FortnightGrid", chip: "moved", moved: true },
        ] },
        { time: "09:30", cells: [
          { subject: "numeracy", activity: "Sorting by size", href: "/setup/blocks?open=FortnightGrid", chip: "clash", clash: true },
          { subject: "arts", activity: "Clay pots", href: "/setup/blocks?open=FortnightGrid" },
          { subject: "language", activity: "Rhyme time", href: "/setup/blocks?open=FortnightGrid" },
        ] },
      ]} />;
    case "CaptureBar":
      return <CaptureBar voice="/setup/blocks?open=CaptureBar" photo="/setup/blocks?open=CaptureBar" />;
    case "DropZone":
      return <DropZone />;
    case "PageImage":
      return <PageImage />;
    case "EmptyState":
      return <EmptyState next={{ href: "/setup/blocks?open=EmptyState", label: "Record a note" }}>No child seen yet on this skill. Record a note in a period and the squares fill in.</EmptyState>;
    case "Form":
      return <Form submit="Save material" fields={[{ name: "material", label: "Material", value: "Bundling sticks", required: true, message: "Say which material" }, { name: "qty", label: "How many", value: "200", numeric: true }]} />;
    case "KeyValue":
      return <KeyValue rows={[{ label: "Class", value: "K2 Red" }, { label: "Sr. No.", value: "01", num: true }, { label: "Educator", value: "Asha Almond" }, { label: "Since", value: "June 2026" }]} />;
    case "Cards":
      return <Cards cards={[
        { kind: "activity", title: "Counting in tens with bundles", line: "Numeracy · 40 minutes", href: "/setup/blocks?open=Cards", link: "Open the activity", status: { state: "toConfirm" }, count: { n: 12, words: "children" } },
        { kind: "objective", title: "Counts objects to 100", line: "3 skills", href: "/setup/blocks?open=Cards", link: "Open the objective" },
        { kind: "skill", title: "Counting in tens", line: "14 children seen", href: "/setup/blocks?open=Cards", link: "Open the skill" },
      ]} />;
    case "KindTile":
      return (
        <div className="b-sample">
          <div className="b-keyrow">{KINDS.map((k) => <KindTile key={k} kind={k} title={KIND_WORDS[k]} />)}</div>
          <ul className="b-rlist" aria-label="Sample rail">
            <li><KindLink kind="objective" href="/setup/blocks?open=KindTile" note="the objective">Counts objects to 20</KindLink></li>
            <li><KindLink kind="child" href="/setup/blocks?open=KindTile" note="the child">Alba Ant</KindLink></li>
          </ul>
        </div>
      );
    case "KanbanBoard":
      return (
        <div className="b-sample">
          <ViewToggle current="board" views={[
            { key: "table", label: "Table", icon: "table", href: "/setup/blocks?open=KanbanBoard&view=table" },
            { key: "board", label: "Board", icon: "board", href: "/setup/blocks?open=KanbanBoard&view=board" },
          ]} />
          <KanbanBoard lanes={[
            { key: "now", label: "Do now", state: "overdue", count: 1, empty: "Nothing is late.", cards: [
              { key: "n1", kind: "note", title: "Counting in tens with bundles", sub: "Voice note · 3 children named", href: "/setup/blocks?open=KanbanBoard", state: "overdue", note: "2 days waiting" },
            ] },
            { key: "week", label: "This week", state: "toConfirm", count: 2, empty: "Nothing waits.", cards: [
              { key: "n2", kind: "note", title: "Story circle: the lost mitten", sub: "Form · 5 children named", href: "/setup/blocks?open=KanbanBoard", state: "toConfirm" },
              { key: "n3", kind: "note", title: "Leaf printing", sub: "Voice note · 2 children named", href: "/setup/blocks?open=KanbanBoard", state: "toConfirm" },
            ] },
            { key: "done", label: "Done", state: "done", count: 0, empty: "Nothing confirmed yet this week.", cards: [] },
          ]} />
        </div>
      );
    case "ChildPeek":
      return <PeekSample first={q.peek} />;
    case "BrandMark":
      return <BrandMark size="large" />;
    case "StatTile":
      return (
        <StatTiles
          label="This week"
          stats={[
            { id: "lessons", n: 30, line: "lessons" },
            { id: "moved", n: 2, line: "moved by hand", tone: "wait" },
            { id: "clashes", n: 1, line: "clash not accepted", tone: "act" },
            { id: "done", n: 18, line: "taught and confirmed", tone: "ok", href: "/setup/blocks?open=StatTile" },
          ]}
        />
      );
    case "DetailPanel":
      return (
        <DetailPanel
          open={{
            key: "lesson:sample",
            kind: "period",
            title: "Counting in tens with bundles",
            line: "08:45–09:30 · K2 Red · Numeracy",
            full: "/setup/blocks?open=DetailPanel",
            closeHref: "/setup/blocks?open=DetailPanel",
            tab: q.tab,
            tabs: [
              {
                key: "activity",
                label: "Activity",
                body: (
                  <ol className="b-levels" data-block-part="rubric">
                    {["Counts with help", "Counts ones", "Bundles tens with help", "Counts in tens alone"].map((w, n) => (
                      <li key={n} className="b-level" data-level={n} data-state={scaleLook(levelState(n, 4))}>
                        <b className="b-num">{n}</b>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ol>
                ),
              },
              { key: "children", label: "Children", body: <p className="b-muted">The class form: each child by Sr. No.</p> },
              { key: "materials", label: "Materials", body: <ul className="list-disc pl-[var(--space-4)]"><li>Bundles of ten sticks · 12</li><li>Number cards 1–100</li></ul> },
              { key: "history", label: "History", body: <p className="b-muted">Not done with this class yet.</p> },
            ],
          }}
          summary={{ title: "This week", stats: [] }}
          inline
        />
      );
    case "SubjectTag":
      return (
        <div className="grid gap-[var(--space-3)]">
          <div className="b-keyrow">
            <SubjectTag look="numeracy" words="Numeracy" />
            <SubjectTag look="language" words="Language" />
            <SubjectTag look="arts" words="Arts" />
          </div>
          <SubjectMix label="Lessons by subject" parts={[{ look: "numeracy", words: "Numeracy", n: 12 }, { look: "language", words: "Language", n: 10 }, { look: "arts", words: "Arts", n: 8 }]} />
        </div>
      );
    case "AppFrame":
      // the real frame, as the pages wear it (the sidebar at the left); `contain: layout` keeps anything fixed to the screen inside the sample
      return (
        <div style={{ contain: "layout", overflow: "hidden", border: "1px solid var(--line)" }}>
          <AppFrame me={me} waiting={0}>
            <p className="b-muted" style={{ padding: "var(--space-3)" }}>A page sits here, under the bar, beside the menu.</p>
          </AppFrame>
        </div>
      );
    default:
      return null;
  }
}
