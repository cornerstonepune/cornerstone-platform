import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KindTile } from "@/components/kind-tile";
import { MachineIf, originFilter } from "@/components/origin";
import { Screen } from "@/components/app-frame";
import { StatusChip } from "@/components/status-chip";
import { activityOpened, objectiveOpened, skillSetOpened } from "@/components/curriculum-panel";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { curriculumRows, type CRow } from "@/lib/curriculum-rows";
import { gap, gateFor, readOffers } from "@/lib/curriculum-screens";
import { pickOrigin, passes, ORIGIN_WORDS } from "@/lib/origin";
import { grades as schoolGrades } from "@/lib/queries";
import { asks } from "@/lib/queries-people";
import { scopeOf } from "@/lib/scope";
import { activityFacts, activityPage, objectiveOf } from "@/lib/teaching";
import type { Column } from "@/lib/ux-rules";
import { Asks, Offers } from "./offers-asks";

type Q = Record<string, string | undefined>;
const HERE = "/setup/curriculum";
const STATUS: [string, string][] = [["empty", "Parts not written"], ["waiting", "Levels to approve"], ["complete", "Complete"]];
const part = (n: number, w: string) => (n ? `${n} ${w}` : "");

// Curriculum (page charter Part C), a Workspace for the coordinator under School: on the left every activity (K2) and skill (grades 1 to 4)
// in one list under one filter row, with where its words and links came from (CP-48: sheet, machine or person; the machine's carry its one
// symbol, and the list narrows by origin); on the right the item chosen (`open=activity:<code>`, `objective:<code>` or `skillset:<code>`),
// in tabs, or with nothing chosen the curriculum's parts counted by where they came from. Nothing waits for a person: a part the machine
// made is edited in place by whoever opens it. Below the list, the skills the machine offers (Yes / No a row) and the engine's questions.
export default async function Curriculum({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const gate = await gateFor(me.email);
  const reviews = gate?.reviews ?? false;
  const q = await searchParams;
  const [school, offers, allAsks, fill] = await deadline(Promise.all([schoolGrades(), gate ? readOffers(me.email).catch(() => []) : Promise.resolve([]), asks(), gate ? gap() : Promise.resolve([])]));
  const all = await deadline(curriculumRows(school, scopeOf(me), gate !== null));

  const pick = (v: string | undefined, ok: Iterable<string>) => (v && [...ok].includes(v) ? v : undefined);
  const grade = pick(q.grade, all.map((r) => r.band));
  const subject = pick(q.subject, all.map((r) => r.subject).filter(Boolean));
  const topic = pick(q.topic, all.map((r) => r.topic).filter(Boolean));
  const status = pick(q.status, STATUS.map(([v]) => v));
  const origin = pickOrigin(q.origin);
  const text = (q.q ?? "").trim().toLowerCase();
  const order = (r: CRow) => school.list.findIndex((g) => g.code === r.band);
  const rows = all
    .filter((r) => (!grade || r.band === grade) && (!subject || r.subject === subject) && (!topic || r.topic === topic) && (!status || r.status === status) && passes(origin, r.origins) && (!text || r.name.toLowerCase().includes(text) || r.code.toLowerCase().includes(text)))
    .sort((a, b) => order(a) - order(b) || a.topic.localeCompare(b.topic) || a.name.localeCompare(b.name));
  const page = Math.max(1, Math.trunc(Number(q.page)) || 1);
  const opage = Math.min(Math.max(1, Math.trunc(Number(q.opage)) || 1), Math.max(1, Math.ceil(offers.length / 10)));
  const open = allAsks.filter((a) => !a.answer);
  const apage = Math.min(Math.max(1, Math.trunc(Number(q.apage)) || 1), Math.max(1, Math.ceil(open.length / 10)));
  const keep = { grade, subject, topic, status, origin, q: q.q?.trim() || undefined };
  // an address of this screen: the choices, the page of each table (the list, the offers, the questions), each paging on its own, and the item open
  const at = (over: { page?: number; opage?: number; apage?: number; open?: string; tab?: string } = {}) => {
    const v = { page: page, opage, apage, open: q.open, tab: q.tab, ...over };
    const s = new URLSearchParams(Object.entries({ ...keep, page: v.page > 1 ? String(v.page) : undefined, opage: v.opage > 1 ? String(v.opage) : undefined, apage: v.apage > 1 ? String(v.apage) : undefined, open: v.open, tab: v.tab }).flatMap(([k, x]) => (x ? [[k, x]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const opened = parseOpen(q.open);
  const shut = at({ open: "", tab: "" });
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
    { key: "grade", label: "Grade", value: (r) => r.grade, width: "5.5rem" },
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
      cell: (r) => (r.status === "waiting" ? <StatusChip state="toApprove" /> : r.status === "empty" ? <StatusChip state="toDo" words={`${r.fill.empty} not written`} /> : <StatusChip state="done" words="complete" />),
      status: true,
      width: "9rem",
    },
  ];

  // the item on the right: an activity or an objective (both behind the curriculum's gate), or a skill of grades 1 to 4 from the list
  let panel: Opened | null = null;
  if (opened && gate && opened.kind === "activity") {
    const a = await activityPage(opened.id);
    if (a) panel = activityOpened(a, await activityFacts(me, a.code), { key: q.open!, closeHref: shut, full: `/setup/activities/${encodeURIComponent(a.code)}`, tab: q.tab, origin, edits: reviews, back: at({}), objectiveHref: (c) => at({ open: `objective:${c}`, tab: "" }) });
  } else if (opened && gate && opened.kind === "objective") {
    const lo = await objectiveOf(me, opened.id);
    if (lo) panel = objectiveOpened(lo, { key: q.open!, closeHref: shut, full: `/setup/objectives/${encodeURIComponent(lo.code)}`, tab: q.tab, origin, activityHref: (c) => at({ open: `activity:${c}`, tab: "" }) });
  } else if (opened?.kind === "skillset") {
    const r = all.find((x) => x.kind === "skill" && x.code === opened.id);
    if (r) panel = skillSetOpened({ ...r, approved: r.fill.school }, { key: q.open!, closeHref: shut, full: r.href, tab: q.tab });
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
      action={
        <FilterBar
          action={HERE}
          keep={{ open: q.open, tab: q.tab }}
          filters={[
            { name: "grade", label: "Grade", value: grade, all: "Every grade", options: school.list.filter((g) => all.some((r) => r.band === g.code)).map((g): [string, string] => [g.code, g.name]) },
            { name: "subject", label: "Subject", value: subject, all: "Every subject", options: uniq(all.map((r) => r.subject)) },
            originFilter(origin),
            { name: "topic", label: "Topic", value: topic, all: "Every topic", options: uniq(all.map((r) => r.topic)) },
            { name: "status", label: "Status", value: status, all: "Any status", options: STATUS },
          ]}
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
                <p className="b-label b-muted">Choose an activity or a skill in the list to see it here.</p>
                {open.length ? (
                  <p className="b-label">
                    {open.length} {open.length === 1 ? "question waits" : "questions wait"} for a person. <a href="#asks" className="underline">Read them</a>
                  </p>
                ) : null}
              </>
            ),
          }}
        />
      }
    >
      {rows.length === 0 ? (
        <EmptyState next={{ href: HERE, label: "Clear the choices" }}>Nothing matches those choices.</EmptyState>
      ) : (
        <DataTable label="Activities and skills" columns={columns} rows={rows} rowKey={(r) => `${r.kind}:${r.code}`} more={{ page, href: (p: number) => at({ page: p }) }} extras={{ attrs: (r) => ({ "data-row": r.code, "data-origins": r.origins.join(" ") }) }} />
      )}
      <Offers offers={offers} page={opage} href={(o) => at({ opage: o })} back={at({})} reviews={reviews} />
      <Asks all={allAsks} me={me} page={apage} href={(a) => `${at({ apage: a })}#asks`} back={`${at({})}#asks`} empty={!!q.empty} />
    </Screen>
  );
}
