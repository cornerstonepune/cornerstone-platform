import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Rail, Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { KindTile } from "@/components/kind-tile";
import { StackBar } from "@/components/stack-bar";
import { Stepper } from "@/components/stepper";
import { StatusChip, type State } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import { deadline } from "@/lib/deadline";
import { levels } from "@/lib/levels";
import { grades, RULE_WORDS } from "@/lib/queries";
import { assessmentList, paperList, type PaperListRow } from "@/lib/queries-papers";
import { chosenNames } from "@/lib/queries-assessment-extras";
import { topicNamesOf } from "@/lib/queries-by-topic";
import { STEP_WORDS, stepCells, type Counts } from "@/lib/assessment-steps";
import { assessmentHref, paperHref, waitsFor } from "@/lib/assessment-ui";
import { weekWords } from "@/lib/week";
import type { Column } from "@/lib/ux-rules";
import { namedRows } from "../../../papers/named";
import { countsOf } from "../../../papers/step-columns";
import { assessmentKey } from "../../../papers/assessments-table";
import { approveThisPack, signOffPaper } from "./actions";
import { LevelSelect } from "./level-select";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> };

/** Where one copy stands, in the order an educator needs them: answers to judge first. */
type Group = "judge" | "signoff" | "check" | "read" | "children" | "made" | "results" | "replaced";
const GROUPS: { key: Group; label: string; state: State }[] = [
  { key: "judge", label: "Answers to judge", state: "judge" },
  { key: "signoff", label: "To sign off", state: "toSignOff" },
  { key: "check", label: "To check", state: "toCheck" },
  { key: "read", label: "Being read", state: "reading" },
  { key: "children", label: "With the children", state: "withChildren" },
  { key: "made", label: "Not printed yet", state: "toApprove" },
  { key: "results", label: "Results in", state: "done" },
  { key: "replaced", label: "Replaced by a newer one", state: "replaced" },
];
const groupOf = (p: PaperListRow): Group =>
  p.stage === "replaced" ? "replaced"
  : p.stage === "signed off" ? "results"
  : p.waiting > 0 ? "judge"
  : p.stage === "checked" ? "signoff"
  : p.stage === "scanned" ? (p.answers === 0 ? "read" : "check")
  : p.stage === "printed" ? "children"
  : "made";

const PAGE = 10;

// One assessment: where it stands (the seven steps), its papers, what it asks, and each child's copy as its own row with
// its own action. There is no button over all of the copies.
export default async function AssessmentPage({ params, searchParams }: Props) {
  const me = await requireStaff();
  const { key } = await params;
  const q = await searchParams;
  const [kind, section, week, set] = key.split("~");
  if (!kind || key.split("~").length < 4) notFound();
  const filter = { kind, class: section || undefined, week: week || undefined, set: set || undefined };
  const [{ rows: found }, copiesAll, g, order, topicNames, chosen] = await deadline(
    Promise.all([assessmentList(filter, me), paperList(filter, me.email, me, "roll"), grades(), levels(), topicNamesOf(), chosenNames([key])]),
  );
  const a = found.find((r) => assessmentKey(r) === key);
  if (!a) notFound();
  const [named] = namedRows([a], { g, topicName: (c) => new Map(topicNames.map((t) => [t.code, t.name])).get(c) ?? c, chosen, files: new Map() });
  const counts: Counts = countsOf(a);
  const wait = waitsFor(counts, a.waiting);
  const { cells, total } = stepCells(counts, a.waiting);
  const copies = copiesAll.rows.filter((p) => !p.spare && !p.extra);
  const reasons = new Map(
    (
      await sql<{ sheet: string; rule: string; by: string | null; why: string | null }[]>`
        select sheet_instance_id as sheet, rule_fired as rule, override_by as by, override_reason as why
        from prescription where sheet_instance_id = any(${copies.map((c) => c.id)}::uuid[])`
    ).map((r) => [r.sheet, `${RULE_WORDS[r.rule] ?? r.rule}${r.why ? ` ${r.by}: ${r.why}` : ""}`] as const),
  );
  const kindLong = kind === "focus" ? "home" : "class";
  void kindLong;

  const live = copies.filter((p) => p.stage !== "replaced");
  const settled = live.filter((p) => p.stage === "signed off").length;
  const toCheck = live.filter((p) => p.stage === "checked" || p.stage === "scanned").length;
  const notBack = live.filter((p) => p.stage === "made" || p.stage === "printed").length;
  const toApprove = counts.home && counts.by.made > 0;
  const toPrint = !counts.home && counts.by.made > 0;
  const printed = live.length > 0 && counts.by.made === 0;
  const qrs = live.filter((p) => p.stage === "made" || p.stage === "printed").map((p) => p.qr);

  // the page of ten copies, grouped by where each stands; the group counts add up to the ten
  const page = Math.max(1, Math.floor(Number(q.page)) || 1);
  const ordered = GROUPS.flatMap((grp) => copies.filter((p) => groupOf(p) === grp.key).map((p) => ({ p, grp })));
  const shown = ordered.slice((page - 1) * PAGE, page * PAGE);
  const later = ordered.length > page * PAGE;
  const mainId = toApprove ? "approve" : toPrint ? "print" : shown.find((s) => s.grp.key !== "replaced" && s.grp.key !== "children" && s.grp.key !== "read")?.p.id;

  const columns = (grp: Group): Column<PaperListRow>[] => [
    { key: "roll", label: "Sr. No.", num: true, width: "6rem", value: (p) => p.roll_no },
    {
      key: "level",
      label: "Level",
      width: "18rem",
      value: (p) => p.level,
      cell: (p) => (
        <>
          {grp === "made" && p.level ? <LevelSelect assessment={key} sheet={p.id} roll={p.roll_no ?? ""} level={p.level} order={order.order} /> : <span>{p.level}</span>}
          <br />
          <span className="b-muted">{reasons.get(p.id) ?? ""}</span>
        </>
      ),
    },
    { key: "settled", label: "Answers settled", num: true, width: "9rem", value: (p) => (p.answers > 0 ? `${p.answers - p.waiting} of ${p.answers}` : grp === "replaced" ? "none" : "none yet") },
    { key: "state", label: "State", status: true, width: "13rem", value: (p) => grp, cell: (p) => <StatusChip state={GROUPS.find((x) => x.key === grp)!.state} words={grp === "judge" ? "Answers to judge" : undefined} /> },
    {
      key: "action",
      label: "Action",
      status: true,
      width: "13rem",
      value: (p) => p.id,
      cell: (p) => {
        const main = mainId === p.id ? "action" : undefined;
        if (grp === "judge" || grp === "check")
          return <Link href={paperHref(key, p.roll_no ?? "")} className={`btn ${main ? "" : "secondary"}`} data-ux={main}>Check this paper</Link>;
        if (grp === "signoff")
          return (
            <form action={signOffPaper}>
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="paper_id" value={p.id} />
              <button type="submit" className={`btn ${main ? "" : "secondary"}`} data-ux={main}>Sign it off</button>
            </form>
          );
        if (grp === "results") return <Link href={p.child_id ? `/growth/${p.child_id}` : "/growth"} className="btn secondary">The child</Link>;
        if (grp === "made") return <span className="b-muted">Change the level before print</span>;
        if (grp === "replaced") return <span className="b-muted">Replaced by a newer one</span>;
        return <span className="b-muted">{grp === "read" ? "The engine is reading it" : "With the children"}</span>;
      },
    },
  ];

  return (
    <Screen
      stage={`${a.band ? g.name(a.band) : "Assessment"} · ${live.length} papers`}
      title={named.name}
      purpose="Where this assessment stands, and each child's copy. A copy is its own row with its own action; there is no button over all of them."
      rail={
        <Rail
          edges={[
            { screen: "assessments", label: "All assessments", icon: "assessment" },
            { screen: "skill", params: { code: a.set ?? "" }, label: "The skills", icon: "skill" },
            { screen: "picture", params: { class: a.section ?? "" }, label: "The class picture", icon: "class" },
          ]}
        />
      }
    >
      {q.said ? <p role="status" className="mb-3 p-3">{q.said}</p> : null}
      <Stepper
        label={`The steps, with how many of the ${total} copies have reached each`}
        steps={cells.map((c) => ({ state: c.state, words: `${STEP_WORDS[c.step]} ${c.reached} of ${c.total}` }))}
      />
      <p className="b-caption my-2">
        {wait.words}. {wait.action.label}.
      </p>
      {toApprove || toPrint || printed ? (
        <section className="b-card my-4" data-kind="assessment" aria-label="This pack">
          <h2 className="b-card-h"><KindTile kind="assessment" /> {toApprove ? "This pack" : "The pack"}</h2>
          <p>
            {toApprove
              ? "Nothing prints without your approval. This approves this pack only."
              : toPrint
                ? "The pack is ready to print."
                : "The pack is printed."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {toApprove ? (
              <form action={approveThisPack}>
                <input type="hidden" name="key" value={key} />
                <button type="submit" className="btn" data-ux={mainId === "approve" ? "action" : undefined}>Approve the pack</button>
              </form>
            ) : null}
            {toApprove ? (
              <button type="button" className="btn secondary" disabled>Print</button>
            ) : qrs.length ? (
              <a href={`/api/papers/print?${qrs.map((x) => `qr=${x}`).join("&")}`} target="_blank" rel="noreferrer" className="btn secondary" data-ux={mainId === "print" ? "action" : undefined}>
                Print
              </a>
            ) : null}
          </div>
        </section>
      ) : null}
      <div className="my-4 grid gap-4 lg:grid-cols-2" data-block="Cards">
        <section className="b-card" data-kind="assessment" aria-label="The papers">
          <h2 className="b-card-h"><KindTile kind="assessment" /> The papers</h2>
          <StackBar
            parts={[
              { state: "done", n: settled, words: "settled" },
              { state: "toCheck", n: toCheck, words: "to check" },
              { state: "notYet", n: notBack, words: "not back" },
            ]}
          />
          <p className="b-caption">{settled} + {toCheck} + {notBack} = the {live.length} copies. A copy replaced by a newer one is not counted.</p>
        </section>
        <section className="b-card" data-kind="skill" aria-label="What it asks">
          <h2 className="b-card-h"><KindTile kind="skill" /> What it asks</h2>
          <span><b>{a.skills.join(", ") || a.title}</b></span>
          <span className="b-muted">{a.levels.length ? `Levels: ${a.levels.join(", ")}` : ""}</span>
          {a.set ? <Link href={`/skill-sets/${a.set}`}>Open the skill</Link> : null}
          {a.week ? <span className="b-muted">{weekWords(a.week)}</span> : null}
        </section>
      </div>
      <h2 className="mb-2">Each child&rsquo;s copy</h2>
      {shown.length === 0 ? (
        <EmptyState>No copies yet. The copies appear here, one row each, when the pack is made.</EmptyState>
      ) : (
        <div className="grid gap-4">
          {GROUPS.map((grp) => {
            const rows = shown.filter((s) => s.grp.key === grp.key).map((s) => s.p);
            if (!rows.length) return null;
            return (
              <section key={grp.key} aria-label={`${grp.label}, ${rows.length} copies`}>
                <h3 className="mb-1">{grp.label} <span className="b-count b-num">{rows.length}</span></h3>
                <DataTable label={grp.label} columns={columns(grp.key)} rows={rows} rowKey={(p) => p.id} more={{ page: 1, href: () => assessmentHref(key) }} />
              </section>
            );
          })}
          <p className="b-caption">
            Copies {(page - 1) * PAGE + 1} to {Math.min(page * PAGE, ordered.length)} of {ordered.length}, grouped by where each stands.
            {later ? <> <Link href={`${assessmentHref(key)}?page=${page + 1}`}>Later →</Link></> : null}
          </p>
        </div>
      )}
    </Screen>
  );
}
