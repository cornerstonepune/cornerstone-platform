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
import { dateWords, weekWords } from "@/lib/week";
import type { Column } from "@/lib/ux-rules";
import { assessmentCard, standing } from "@/lib/queries-card";
import { spareSheets, unplanned, weekPlan } from "@/lib/queries-approve";
import { schoolToday } from "@/lib/school-clock";
import { namedRows } from "../../../papers/named";
import { countsOf } from "../../../papers/step-columns";
import { assessmentKey } from "../../../papers/assessments-table";
import { approveThisPack, awayThis, givenOnThis, signOffPaper } from "./actions";
import { LevelSelect } from "./level-select";
import { RenameForm } from "../rename-form";
import { ApprovalLedger, madeWords, packsOf } from "./ledger";

const safeDecode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

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

/** What one tap approves, the children's papers and the spares apart. */
const approvesWords = (papers: number, spares: number) =>
  [papers && `${papers} paper${papers === 1 ? "" : "s"}`, spares && `${spares} spare${spares === 1 ? "" : "s"}`].filter(Boolean).join(" and ");

// One assessment: where it stands (the seven steps), its papers, what it asks, and each child's copy as its own row with
// its own action. There is no button over all of the copies.
export default async function AssessmentPage({ params, searchParams }: Props) {
  const me = await requireStaff();
  // the address arrives as it was written, percent-encoded where the key holds a character an address cannot
  const key = safeDecode((await params).key);
  const q = await searchParams;
  // the set can hold a "~" of its own (a paper made from chosen areas), so it is the rest of the key
  const [kind, section, week, ...rest] = key.split("~");
  const set = rest.join("~");
  if (!kind || key.split("~").length < 4) notFound();
  const filter = { kind, class: section || undefined, week: week || undefined, set: set || undefined };
  const [{ rows: found }, copiesAll, g, order, topicNames, chosen, card] = await deadline(
    Promise.all([
      assessmentList(filter, me), paperList(filter, me.email, me, "roll"), grades(), levels(), topicNamesOf(), chosenNames([key]),
      assessmentCard({ class: section, week, kind, set: set || undefined }, me.email, me),
    ]),
  );
  // the educator's word on the card: the day it was given, and the children who were away (held for later, not missing)
  const away = new Set(card.copies.filter((c) => c.away).map((c) => c.id));
  // a class's week: each child on the plan handed no paper (and why), each child on the roll with no plan, and the spares with no name on them
  // (a home assessment has no plan of its own: its papers come from each child's own proposal, so it has no list of children without one)
  const planned = section && week && (kind === "practice" || kind === "assessment") ? await deadline(Promise.all([weekPlan(section, week, kind, me.email), unplanned(section, week, kind, me.email), spareSheets(section, week, kind)])) : null;
  const spares = planned?.[2] ?? [];
  const sparesWaiting = spares.filter((x) => x.print_status === "new").length;
  const where = standing(card);
  const rollsSaid = (cs: { roll_no: string | null; qr: string }[]) => cs.map((c) => (c.roll_no ? `roll ${c.roll_no}` : c.qr)).join(", ");
  const retake = card.copies.filter((c) => c.retake.length);
  const a = found.find((r) => assessmentKey(r) === key);
  if (!a) notFound();
  const [named] = namedRows([a], { g, topicName: (c) => new Map(topicNames.map((t) => [t.code, t.name])).get(c) ?? c, chosen, files: new Map() });
  const counts: Counts = countsOf(a);
  const wait = waitsFor(counts, a.waiting);
  const { cells, total } = stepCells(counts, a.waiting);
  const copies = copiesAll.rows.filter((p) => !p.spare && !p.extra);
  const noPaper = planned
    ? [
        ...planned[0].filter((r) => !r.qr_code).map((r) => ({ roll: r.roll_no ?? "", why: r.no_paper ?? "the class's papers are not made yet" })),
        // a child with no plan who holds a copy has a paper: only those with none are listed
        ...planned[1].filter((c) => !copies.some((p) => p.roll_no === c.roll_no && p.stage !== "replaced")).map((c) => ({ roll: c.roll_no ?? "", why: c.later ? "joined the class after this week was planned" : "not on this week's plan" })),
      ].sort((x, y) => Number(x.roll) - Number(y.roll) || x.roll.localeCompare(y.roll))
    : [];
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
  const packs = await deadline(packsOf(live.map((p) => p.id)));
  // "Easy for 8 children, Medium for 12": the school's levels, easiest first, each with the copies at it
  const levelsSaid = order.order
    .map((l) => [l, live.filter((p) => p.level === l && p.child_id).length] as const)
    .filter(([, n]) => n > 0)
    .map(([l, n]) => `${l} for ${n} ${n === 1 ? "child" : "children"}`)
    .join(", ");
  const second = packs.length > 1 ? packs[packs.length - 1] : null;
  const settled = live.filter((p) => p.stage === "signed off").length;
  const toCheck = live.filter((p) => p.stage === "checked" || p.stage === "scanned").length;
  const notBack = live.filter((p) => p.stage === "made" || p.stage === "printed").length;
  const toApprove = counts.home && counts.by.made > 0;
  const toPrint = !counts.home && counts.by.made > 0;
  const printed = live.length > 0 && counts.by.made === 0;
  const qrs = live.filter((p) => p.stage === "made" || p.stage === "printed").map((p) => p.qr);
  // printed and not yet back: what the day "Given on" is said for (with the spares, which are given out too)
  const out = live.filter((p) => p.stage === "printed");
  const today = await schoolToday();

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
    { key: "state", label: "State", status: true, width: "13rem", value: () => grp, cell: (p) => <StatusChip state={GROUPS.find((x) => x.key === grp)!.state} words={grp === "judge" ? "Answers to judge" : grp === "children" && away.has(p.id) ? "Away, held for later" : undefined} /> },
    {
      key: "action",
      label: "Action",
      status: true,
      width: "13rem",
      value: (p) => p.id,
      cell: (p) => {
        const main = mainId === p.id ? "action" : undefined;
        if (grp === "judge" || grp === "check")
          return <Link href={paperHref(key, p.roll_no ?? "")} className={`btn ${main ? "" : "secondary"}`} data-check-paper="" data-ux={main}>Check this paper</Link>;
        if (grp === "signoff")
          return (
            <form action={signOffPaper}>
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="paper_id" value={p.id} />
              <button type="submit" data-signoff="" className={`btn ${main ? "" : "secondary"}`} data-ux={main}>Sign it off</button>
            </form>
          );
        if (grp === "results") return <Link href={p.child_id ? `/growth/${p.child_id}` : "/growth"} className="btn secondary" data-child-link="">The child</Link>;
        if (grp === "made")
          return kind === "focus" && p.roll_no ? (
            <Link href={paperHref(key, p.roll_no)} className="btn secondary" data-edit-paper="">Edit this paper</Link>
          ) : (
            <span className="b-muted">Change the level before print</span>
          );
        if (grp === "replaced") return <span className="b-muted">Replaced by a newer one</span>;
        if (grp === "children")
          return (
            <form action={awayThis}>
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="qr" value={p.qr} />
              <input type="hidden" name="away" value={away.has(p.id) ? "no" : "yes"} />
              <button type="submit" data-away="" className="btn secondary">{away.has(p.id) ? "Back: count as missing" : "Away: hold it for later"}</button>
            </form>
          );
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
          cards={<ApprovalLedger packs={packs} />}
          edges={[
            { screen: "assessments", href: "/children/assessments", label: "All assessments", icon: "assessment" },
            ...(qrs.length ? [{ screen: "assessment", href: `/api/papers/print?${qrs.map((x) => `qr=${x}`).join("&")}`, label: "The printed pack", icon: "assessment" as const, newTab: true }] : []),
            { screen: "skill", params: { code: a.set ?? "" }, label: "The skills", icon: "skill" },
            { screen: "picture", params: { class: a.section ?? "" }, label: "The class picture", icon: "class" },
            ...(shown.find((x) => x.p.roll_no && x.grp.key !== "replaced") ? [{ screen: "paper", href: paperHref(key, shown.find((x) => x.p.roll_no && x.grp.key !== "replaced")!.p.roll_no!), label: "A child's paper", icon: "correct" as const }] : []),
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
          <h2 className="b-card-h"><KindTile kind="assessment" /> {second?.words === "waits for you" ? `The ${second.name.toLowerCase()}: ${second.rolls.length} new ${second.rolls.length === 1 ? "copy" : "copies"}` : toApprove ? "This pack" : "The pack"}</h2>
          <p>
            {second?.words === "waits for you" ? `${madeWords(second)} ` : ""}
            {toApprove
              ? `Nothing prints without your approval. This approves ${approvesWords(live.filter((p) => p.stage === "made").length, sparesWaiting) || "nothing more"}, this pack only.`
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
              <button type="button" className="btn secondary" aria-disabled="true" title="Print appears once the pack is approved">Print</button>
            ) : qrs.length ? (
              <a href={`/api/papers/print?${qrs.map((x) => `qr=${x}`).join("&")}`} target="_blank" rel="noreferrer" className="btn secondary" data-ux={mainId === "print" ? "action" : undefined}>
                Print
              </a>
            ) : null}
          </div>
          {out.length ? (
            <div className="mt-3">
              <p data-testid="given">{card.given ? `Given on ${dateWords(card.given.on)}, said by ${card.given.by}.` : "Not said to be given yet."}</p>
              <form action={givenOnThis} className="mt-1 flex flex-wrap items-end gap-2">
                <input type="hidden" name="key" value={key} />
                {[...out.map((c) => c.qr), ...card.spares.map((c) => c.qr)].map((qr) => (
                  <input key={qr} type="hidden" name="qr" value={qr} />
                ))}
                <label className="grid gap-1">
                  <span className="label">Day it was given</span>
                  <input className="input" type="date" name="on" defaultValue={card.given?.on ?? today} max={today} required />
                </label>
                <button type="submit" className="btn secondary" data-given-save="">Given on</button>
              </form>
            </div>
          ) : null}
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
          {where.n > 0 ? (
            <p data-testid="in" className="b-caption">
              {where.inn} of {where.n} in{where.out.length ? ` · missing: ${rollsSaid(where.out)}` : ""}
              {where.away.length ? ` · away, held for later: ${rollsSaid(where.away)}` : ""}
            </p>
          ) : null}
          {card.reading ? (
            <p data-testid="reading" className="b-caption">
              Reading a file now: page {card.reading.pages} of {card.reading.of}
              {card.reading.minutes ? `, about ${card.reading.minutes} ${card.reading.minutes === 1 ? "minute" : "minutes"} left` : ""}.
            </p>
          ) : null}
        </section>
        <section className="b-card" data-kind="skill" aria-label="What it asks">
          <h2 className="b-card-h"><KindTile kind="skill" /> What it asks</h2>
          <span><b>{a.skills.join(", ") || a.title}</b></span>
          <span className="b-muted">{a.topics.map((t) => topicNames.find((x) => x.code === t)?.name ?? t).join(" · ")}</span>
          <span className="b-muted">{levelsSaid}</span>
          {a.set ? <Link href={`/skill-sets/${a.set}`}>Open the skill</Link> : null}
          {a.week ? <span className="b-muted">{weekWords(a.week)}</span> : null}
          <RenameForm assessmentKey={key} name={named.name} back={assessmentHref(key)} />
        </section>
      </div>
      {noPaper.length ? (
        <section aria-label="Children with no paper" className="mb-4" data-no-paper>
          <h2 className="mb-2">Children with no paper <span className="b-muted">{noPaper.length}</span></h2>
          <DataTable
            label="Children with no paper"
            columns={[
              { key: "roll", label: "Sr. No.", num: true, width: "6rem", value: (r: (typeof noPaper)[number]) => r.roll },
              { key: "why", label: "Why", value: (r: (typeof noPaper)[number]) => r.why },
              { key: "state", label: "State", status: true, width: "10rem", value: () => "No paper", cell: () => <StatusChip state="noPaper" words="No paper" /> },
            ]}
            rows={noPaper}
            rowKey={(r) => r.roll}
            more={{ page: 1, href: () => assessmentHref(key) }}
          />
        </section>
      ) : null}
      {spares.length ? (
        <section aria-label="Spare copies" className="mb-4" data-spares>
          <h2 className="mb-2">Spare copies <span className="b-muted">{spares.length}</span></h2>
          <p className="b-caption">Extra papers with no name on them, for a spoilt page or a child who arrives late.</p>
          <DataTable
            label="Spare copies"
            columns={[
              { key: "level", label: "Level", width: "10rem", value: (r: (typeof spares)[number]) => r.difficulty },
              { key: "paper", label: "Paper", value: (r: (typeof spares)[number]) => r.qr_code },
              { key: "state", label: "State", status: true, width: "10rem", value: (r: (typeof spares)[number]) => r.print_status, cell: (r: (typeof spares)[number]) => <StatusChip state={r.print_status === "new" ? "toApprove" : "done"} words={r.print_status === "new" ? "To approve" : "Printed"} /> },
            ]}
            rows={spares}
            rowKey={(r) => r.qr_code}
            more={{ page: 1, href: () => assessmentHref(key) }}
          />
        </section>
      ) : null}
      {retake.length ? (
        <div role="alert" aria-label="To photograph again" className="mb-4 p-3">
          <p className="font-semibold">To photograph again</p>
          <ul className="ml-5 list-disc">
            {retake.map((c) => (
              <li key={c.qr}>
                {c.roll_no ? `Roll ${c.roll_no}` : c.qr}: {c.retake.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
          </p>
          {later ? (
            <nav aria-label="Copies pages">
              <Link href={`${assessmentHref(key)}?page=${page + 1}`} className="chip">Later →</Link>
            </nav>
          ) : null}
        </div>
      )}
    </Screen>
  );
}
