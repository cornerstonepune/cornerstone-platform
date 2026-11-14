import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KindTile } from "@/components/kind-tile";
import { ViewToggle } from "@/components/kanban-board";
import { MachineIf, approvalFilter, originFilter } from "@/components/origin";
import { Screen } from "@/components/app-frame";
import { StatusChip } from "@/components/status-chip";
import { activityOpened, objectiveOpened } from "@/components/curriculum-panel";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { curriculumRows, type CRow } from "@/lib/curriculum-rows";
import { gap, gateFor, readOffers } from "@/lib/curriculum-screens";
import { approvalOf, pickApproval, pickOrigin, passes, ORIGIN_WORDS } from "@/lib/origin";
import { grades as schoolGrades } from "@/lib/queries";
import { asks } from "@/lib/queries-people";
import { scopeOf } from "@/lib/scope";
import { activityFacts, activityPage, objectiveOf } from "@/lib/teaching";
import type { Column } from "@/lib/ux-rules";
import { Asks, Offers } from "./offers-asks";
import { ApproveForm } from "./approve";
import { LessonsToConfirm } from "./lessons-view";
import { lessonsToConfirm } from "@/lib/lessons-to-confirm";
import { SubjectChips, TopicList } from "@/components/curriculum/navigator";
import { skillOpened } from "@/components/curriculum/skill-panel";
import { skillSet } from "@/lib/queries";
import { levels as schoolLevels } from "@/lib/levels";
import { subjectLooks } from "@/lib/subject-looks";
import { untaughtByGrade } from "@/lib/taught";
import { mayDecide } from "@/lib/decides";

type Q = Record<string, string | undefined>;
const HERE = "/setup/curriculum";
const STATUS: [string, string][] = [["empty", "Parts not written"], ["waiting", "Levels to approve"], ["complete", "Complete"]];
const part = (n: number, w: string) => (n ? `${n} ${w}` : "");
// the navigator's subject of a row: a skill's own subject; an activity (K2) has none, and is under its grade
const subjectOf = (r: CRow) => r.subject || r.grade;
// CP-51: a row is to approve while anything of it is the machine's or its levels wait for a person
const approvalOfRow = (r: CRow) => approvalOf(r.origins, r.status === "waiting");

// Curriculum (page charter Part C), a Workspace for the coordinator under School: on the left every activity (K2) and skill (grades 1 to 4)
// in one list under one filter row, with where its words and links came from (CP-48: sheet, machine or person; the machine's carry its one
// symbol, and the list narrows by origin); on the right the item chosen (`open=activity:<code>`, `objective:<code>` or `skillset:<code>` (also `skill:<code>`)),
// in tabs, or with nothing chosen the curriculum's parts counted by where they came from. Nothing waits for a person: a part the machine
// made is edited in place by whoever opens it. Below the list, the skills the machine offers (Yes / No a row) and the engine's questions.
export default async function Curriculum({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const gate = await gateFor(me.email);
  const reviews = gate?.reviews ?? false;
  const q = await searchParams;
  const [school, offers, allAsks, fill, lessons] = await deadline(Promise.all([schoolGrades(), gate ? readOffers(me.email).catch(() => []) : Promise.resolve([]), asks(), gate ? gap() : Promise.resolve([]), gate ? lessonsToConfirm() : Promise.resolve([])]));
  const all = await deadline(curriculumRows(school, scopeOf(me), gate !== null));

  const pick = (v: string | undefined, ok: Iterable<string>) => (v && [...ok].includes(v) ? v : undefined);
  const grade = pick(q.grade, all.map((r) => r.band));
  const topic = pick(q.topic, all.map((r) => r.topic).filter(Boolean));
  // a topic chosen alone names its subject: the navigator opens on it (a link to a topic is a link to its place)
  const subject = pick(q.subject, all.map(subjectOf)) ?? (() => {
    const first = topic ? all.find((r) => r.topic === topic) : undefined;
    return first ? subjectOf(first) : undefined;
  })();
  const status = pick(q.status, STATUS.map(([v]) => v));
  const origin = pickOrigin(q.origin);
  const approval = pickApproval(q.approval);
  const text = (q.q ?? "").trim().toLowerCase();
  const order = (r: CRow) => school.list.findIndex((g) => g.code === r.band);
  const rows = all
    .filter((r) => (!grade || r.band === grade) && (!subject || subjectOf(r) === subject) && (!topic || r.topic === topic) && (!status || r.status === status) && passes(origin, r.origins) && (!approval || approvalOfRow(r) === approval) && (!text || r.name.toLowerCase().includes(text) || r.code.toLowerCase().includes(text)))
    .sort((a, b) => order(a) - order(b) || a.topic.localeCompare(b.topic) || a.name.localeCompare(b.name));
  const page = Math.max(1, Math.trunc(Number(q.page)) || 1);
  const opage = Math.min(Math.max(1, Math.trunc(Number(q.opage)) || 1), Math.max(1, Math.ceil(offers.length / 10)));
  const open = allAsks.filter((a) => !a.answer);
  const apage = Math.min(Math.max(1, Math.trunc(Number(q.apage)) || 1), Math.max(1, Math.ceil(open.length / 10)));
  // three views of one page, one at a time (13 Nov 2026: "3, 4, 5 long tables"): the list, the machine's offers, the engine's questions;
  // a page of the offers or the questions opens its own view
  const view: "list" | "offers" | "asks" | "lessons" = q.view === "offers" || q.opage ? "offers" : q.view === "asks" || q.apage ? "asks" : q.view === "lessons" || q.lpage ? "lessons" : "list";
  const lpage = Math.min(Math.max(1, Math.trunc(Number(q.lpage)) || 1), Math.max(1, Math.ceil(lessons.length / 10)));
  const keep = { grade, subject: q.subject ? subject : undefined, topic, status, origin, approval, q: q.q?.trim() || undefined, view: view === "list" ? undefined : view };
  // an address of this screen: the choices, the page of each table (the list, the offers, the questions), each paging on its own, and the item open
  const at = (over: { page?: number; opage?: number; apage?: number; open?: string; tab?: string } = {}) => {
    const v = { page: page, opage, apage, open: q.open, tab: q.tab, ...over };
    const s = new URLSearchParams(Object.entries({ ...keep, page: v.page > 1 ? String(v.page) : undefined, opage: v.opage > 1 ? String(v.opage) : undefined, apage: v.apage > 1 ? String(v.apage) : undefined, open: v.open, tab: v.tab }).flatMap(([k, x]) => (x ? [[k, x]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const viewAt = (v: "list" | "offers" | "asks" | "lessons") => {
    const s = new URLSearchParams(Object.entries({ ...keep, view: v === "list" ? undefined : v }).flatMap(([k, x]) => (x ? [[k, x]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const opened = parseOpen(q.open);
  const shut = at({ open: "", tab: "" });
  // the navigator's addresses: a subject chosen starts its topics afresh; a topic keeps its subject
  const nav = (over: { subject?: string; topic?: string }) => {
    const s = new URLSearchParams(Object.entries({ ...keep, view: undefined, ...over }).flatMap(([k, x]) => (x ? [[k, x]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  // the rows each step counts: every other choice kept, the step's own left open
  const others = all.filter((r) => (!grade || r.band === grade) && (!status || r.status === status) && passes(origin, r.origins) && (!approval || approvalOfRow(r) === approval) && (!text || r.name.toLowerCase().includes(text) || r.code.toLowerCase().includes(text)));
  const inSubject = others.filter((r) => !subject || subjectOf(r) === subject);
  const looks = await subjectLooks();
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort().map((x): [string, string] => [x, x]);

  const columns: Column<CRow>[] = [
    {
      key: "name",
      label: "Activity or skill",
      width: "16rem", // a name is read whole: the other columns together leave it at least this much of a 1024 px page
      value: (r) => r.name,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <KindTile kind={r.kind} />
          <Link href={at({ open: r.open, tab: "" })} scroll={false} data-open-key={r.open} aria-current={q.open === r.open || undefined} {...{ [`data-${r.kind}-row`]: "" }}>
            {r.name}
          </Link>
          <MachineIf origin={r.origins} />
        </span>
      ),
    },
    { key: "code", label: "Code", value: (r) => r.code, width: "7rem" },
    { key: "grade", label: "Grade", value: (r) => r.grade, cell: (r) => <span className="b-label b-muted" data-tag="grade">{r.grade}</span>, width: "5.5rem" },
    { key: "subject", label: "Subject", value: (r) => r.subject, width: "7.5rem" },
    { key: "topic", label: "Topic", value: (r) => r.topic, width: "9rem" },
    { key: "origin", label: "Origin", value: (r) => r.origins.map((o) => ORIGIN_WORDS[o]).join(" · "), width: "8rem" },
    {
      key: "filled",
      label: "Filled",
      value: (r) => (r.kind === "skill" ? `${r.fill.school} of ${r.levels} levels approved` : [part(r.fill.school, "sheet"), part(r.fill.drafted, "machine"), part(r.fill.person, "person"), part(r.fill.empty, "empty")].filter(Boolean).join(" · ")),
      width: "12rem",
    },
    {
      key: "status",
      label: "Status",
      value: (r) => r.status,
      cell: (r) => (r.status === "empty" ? <StatusChip state="toDo" words={`${r.fill.empty} not written`} /> : approvalOfRow(r) === "toApprove" ? <StatusChip state="toApprove" /> : <StatusChip state="done" words="complete" />),
      status: true,
      width: "9rem",
    },
  ];

  // the item on the right: an activity or an objective (both behind the curriculum's gate), or a skill of grades 1 to 4 from the list
  let panel: Opened | null = null;
  if (opened && gate && opened.kind === "activity") {
    const a = await activityPage(opened.id);
    if (a) panel = activityOpened(a, await activityFacts(me, a.code), { key: q.open!, closeHref: shut, full: `/setup/activities/${encodeURIComponent(a.code)}`, tab: q.tab, origin, edits: reviews, back: at({}), objectiveHref: (c) => at({ open: `objective:${c}`, tab: "" }) });
    // CP-51: what the machine made waits for a reviewer's Approve (the panel's machine mark is that test)
    if (a && panel?.mark && reviews) panel = { ...panel, actions: <ApproveForm kind="activity" code={a.code} name={a.name} back={at({})} /> };
  } else if (opened && gate && opened.kind === "objective") {
    const lo = await objectiveOf(me, opened.id);
    if (lo) panel = objectiveOpened(lo, { key: q.open!, closeHref: shut, full: `/setup/objectives/${encodeURIComponent(lo.code)}`, tab: q.tab, origin, activityHref: (c) => at({ open: `activity:${c}`, tab: "" }) });
    if (lo && panel?.mark && reviews) panel = { ...panel, actions: <ApproveForm kind="objective" code={lo.code} name={lo.title} back={at({})} /> };
  } else if (opened?.kind === "skillset" || opened?.kind === "skill") {
    const r = all.find((x) => x.kind === "skill" && x.code === opened.id);
    const s = r ? await skillSet(r.code, scopeOf(me)) : undefined;
    if (r && s) {
      const [{ order }, untaught, say] = await Promise.all([schoolLevels(), untaughtByGrade(scopeOf(me)), mayDecide(me, "topics")]);
      panel = skillOpened(s, { key: q.open!, closeHref: shut, full: r.href, tab: q.tab, grade: r.grade, order, looks, untaught: untaught(r.band, r.code), say });
    }
  }
  const sum = (k: "school" | "drafted" | "person" | "empty") => fill.reduce((t, g) => t + g[k], 0);
  const stats = gate
    ? [
        { id: "sheet", n: sum("school"), line: "parts from the sheet" },
        { id: "machine", n: sum("drafted"), line: "parts made by the machine" },
        { id: "person", n: sum("person"), line: "parts a person wrote" },
        { id: "empty", n: sum("empty"), line: "parts not written" },
      ]
    : [{ id: "skills", n: all.length, line: "skills of grades 1 to 4" }];

  return (
    <Screen
      stage="School"
      title="Curriculum"
      purpose="Every activity and skill of every grade, with where its words and links came from. Choose one to read or edit it on the right."
      details={{ href: "/setup/curriculum/skills", label: "Every skill, with its levels and where it is taught" }}
      action={
        <FilterBar
          action={HERE}
          keep={{ open: q.open, tab: q.tab, view: view === "list" ? undefined : view }}
          filters={[
            { name: "grade", label: "Grade", value: grade, all: "Every grade", options: school.list.filter((g) => all.some((r) => r.band === g.code)).map((g): [string, string] => [g.code, g.name]) },
            { name: "subject", label: "Subject", value: subject, all: "Every subject", options: uniq(all.map((r) => r.subject)) },
            approvalFilter(approval),
            originFilter(origin),
            { name: "topic", label: "Topic", value: topic, all: "Every topic", options: uniq(all.map((r) => r.topic)) },
            { name: "status", label: "Status", value: status, all: "Any status", options: STATUS },
          ]}
          shown={4}
          search={{ name: "q", value: q.q?.trim(), placeholder: "Name or code" }}
        />
      }
      panel={
        <DetailPanel
          open={panel}
          summary={{
            title: gate ? "Where the words came from" : "The curriculum",
            stats,
            after: (
              <>
                {open.length ? (
                  <p className="b-label">
                    {open.length} {open.length === 1 ? "question waits" : "questions wait"} for a person. <a href={viewAt("asks")} className="underline">Read them</a>
                  </p>
                ) : null}
              </>
            ),
          }}
        />
      }
    >
      <div className="mb-[var(--space-3)]">
        <ViewToggle
          current={view}
          views={[
            { key: "list", label: `Activities and skills (${rows.length.toLocaleString("en-IN")})`, icon: "activity", href: viewAt("list") },
            ...(offers.length ? [{ key: "offers", label: `Offers waiting (${offers.length})`, icon: "skill" as const, href: viewAt("offers") }] : []),
            ...(allAsks.length ? [{ key: "asks", label: `Questions to answer (${open.length})`, icon: "objective" as const, href: viewAt("asks") }] : []),
            ...(lessons.length ? [{ key: "lessons", label: `Lessons to confirm (${lessons.length})`, icon: "activity" as const, href: viewAt("lessons") }] : []),
          ]}
        />
      </div>
      {view === "offers" ? (
        <Offers offers={offers} page={opage} href={(o) => at({ opage: o })} back={at({})} reviews={reviews} />
      ) : view === "lessons" ? (
        <LessonsToConfirm rows={lessons} page={lpage} href={(p) => `${HERE}?view=lessons${p > 1 ? `&lpage=${p}` : ""}`} />
      ) : view === "asks" ? (
        <Asks all={allAsks} me={me} page={apage} href={(a) => at({ apage: a })} back={at({})} empty={!!q.empty} />
      ) : (
        <>
          <SubjectChips rows={others.map((r) => ({ subject: subjectOf(r), topic: r.topic }))} subject={subject} href={(s) => nav({ subject: s, topic: undefined })} looks={looks} />
          <div className="flex flex-col gap-[var(--space-3)] md:flex-row md:items-start">
            {subject ? <TopicList rows={inSubject.map((r) => ({ subject: subjectOf(r), topic: r.topic }))} topic={topic} href={(t) => nav({ subject, topic: t })} /> : null}
            <div className="min-w-0 flex-1">
              {rows.length === 0 ? (
                <EmptyState next={{ href: HERE, label: "Clear the choices" }}>Nothing matches those choices.</EmptyState>
              ) : (
                <DataTable label="Activities and skills" columns={columns} rows={rows} rowKey={(r) => `${r.kind}:${r.code}`} more={{ page, href: (p: number) => at({ page: p }) }} extras={{ attrs: (r) => ({ "data-row": r.code, "data-origins": r.origins.join(" ") }) }} />
              )}
            </div>
          </div>
        </>
      )}
    </Screen>
  );
}
