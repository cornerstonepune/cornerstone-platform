import { notFound } from "next/navigation";
import Link from "@/components/link";
import { Screen } from "@/components/app-frame";
import { DataTable } from "@/components/data-table";
import { DetailPanel } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { KindTile } from "@/components/kind-tile";
import { StackBar } from "@/components/stack-bar";
import { Stepper } from "@/components/stepper";
import { GROUPS, groupOf } from "@/lib/copy-groups";
import { requireStaff } from "@/lib/auth";
import { sql } from "@/lib/db";
import { deadline } from "@/lib/deadline";
import { levels } from "@/lib/levels";
import { grades, RULE_WORDS } from "@/lib/queries";
import { assessmentList, paperList } from "@/lib/queries-papers";
import { chosenNames, fileLinks } from "@/lib/queries-assessment-extras";
import { topicNamesOf } from "@/lib/queries-by-topic";
import { STEP_WORDS, stepCells, type Counts } from "@/lib/assessment-steps";
import { assessmentHref, openIdOf, paperHref, waitsFor } from "@/lib/assessment-ui";
import { dateWords, weekWords } from "@/lib/week";
import { assessmentCard, standing } from "@/lib/queries-card";
import { spareSheets, unplanned, weekPlan } from "@/lib/queries-approve";
import { schoolToday } from "@/lib/school-clock";
import { namedRows } from "../named";
import { countsOf } from "../step-counts";
import { assessmentKey } from "../assessment-key";
import { assessmentPanel } from "../assessment-panel";
import { approveThisPack, givenOnThis } from "./actions";
import { copyColumns } from "./copy-columns";
import { Extras } from "./extras";
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

const PAGE = 10;

/** What one tap approves, the children's papers and the spares apart. */
const approvesWords = (papers: number, spares: number) =>
  [papers && `${papers} paper${papers === 1 ? "" : "s"}`, spares && `${spares} spare${spares === 1 ? "" : "s"}`].filter(Boolean).join(" and ");

// One assessment (page charter Part C: "An assessment / a child's paper: become B6's panel; full-page address kept for links"): the board's
// assessment panel opened full page, with the same tabs (Copies · Upload · Check · Results). Above the tabs, the pack's own acts (approve,
// print, the day it was given) and where it leads; the Copies tab says more here: the seven steps, the papers, what it asks, and each child's
// copy as its own row with its own action. There is no button over all of the copies.
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
  const [classId] = section ? (await sql<{ id: string }[]>`select id::text from school_class where label = ${section} order by created_at limit 1`).map((c) => c.id) : [];
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
  // nothing prints before the pack is approved (the engine refuses it): a class's papers are approved on this screen too, in the signer's name
  const toApprove = counts.by.made > 0;
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
  const mainId = toApprove ? "approve" : printed && qrs.length ? "print" : shown.find((s) => s.grp.key === "judge" || s.grp.key === "check" || s.grp.key === "signoff")?.p.id;

  const ctx = { key, kind, away, reasons, order: order.order, mainId };
  const printHref = qrs.length ? `/api/papers/print?${qrs.map((x) => `qr=${x}`).join("&")}` : null;
  const firstPaper = shown.find((x) => x.p.roll_no && x.grp.key !== "replaced");
  // the pack's own acts (approve, print, the day it was given) and the pages it leads to: the panel's actions, above its tabs
  const actions = (
    <div className="grid basis-full gap-[var(--space-2)]">
      {toApprove || printed ? (
        <section className="b-card" data-kind="assessment" aria-label="This pack">
          <h2 className="b-card-h"><KindTile kind="assessment" /> {second?.words === "waits for you" ? `The ${second.name.toLowerCase()}: ${second.rolls.length} new ${second.rolls.length === 1 ? "copy" : "copies"}` : toApprove ? "This pack" : "The pack"}</h2>
          <p>
            {second?.words === "waits for you" ? `${madeWords(second)} ` : ""}
            {toApprove
              ? `Nothing prints without your approval. This approves ${approvesWords(live.filter((p) => p.stage === "made").length, sparesWaiting) || "nothing more"}, this pack only.`
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
            ) : printHref ? (
              <a href={printHref} target="_blank" rel="noreferrer" className="btn secondary" data-ux={mainId === "print" ? "action" : undefined}>
                Print
              </a>
            ) : null}
          </div>
          {out.length ? (
            <div className="mt-3">
              {/* a paper in says it was given, though no one said the day (the old card's words, kept: `standing` counts it given) */}
              <p data-testid="given">{card.given ? `Given on ${dateWords(card.given.on)}, said by ${card.given.by}.` : where.inn ? "Papers are in, so it was given; no one said the day." : "Not said to be given yet."}</p>
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
      <nav aria-label="Where this assessment leads" className="flex flex-wrap gap-x-[var(--space-3)] gap-y-1" data-part="leads">
        <Link href="/children/assessments">All assessments</Link>
        {printHref ? <a href={printHref} target="_blank" rel="noreferrer">The printed pack</a> : null}
        {a.set ? <Link href={`/setup/skills/${encodeURIComponent(a.set)}`}>The skills</Link> : null}
        {classId ? <Link href={`/children/${classId}`}>The class picture</Link> : null}
        {firstPaper ? <Link href={paperHref(key, firstPaper.p.roll_no!)}>A child&rsquo;s paper</Link> : null}
      </nav>
      <ApprovalLedger packs={packs} />
    </div>
  );
  // Copies, as the full page says it: the steps, the papers and what it asks, the children with no paper, the extra and spare copies, and
  // each child's copy as its own row with its own action
  const copiesMore = (
    <div className="grid gap-[var(--space-3)]">
      <Stepper
        label={`The steps, with how many of the ${total} copies have reached each`}
        steps={cells.map((c) => ({ state: c.state, words: `${STEP_WORDS[c.step]} ${c.reached} of ${c.total}` }))}
      />
      <p className="b-caption">
        {wait.words}. {wait.action.label}.
      </p>
      <div className="grid gap-4 lg:grid-cols-2" data-block="Cards">
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
          {a.set ? <Link href={`/setup/skill-sets/${a.set}`}>Open the skill</Link> : null}
          {a.week ? <span className="b-muted">{weekWords(a.week)}</span> : null}
          <RenameForm assessmentKey={key} name={named.name} back={assessmentHref(key)} />
        </section>
      </div>
      <Extras key_={key} classId={classId} noPaper={noPaper} extras={copiesAll.rows.filter((p) => p.extra)} spares={spares} retake={retake} />
      <h2>Each child&rsquo;s copy</h2>
      {shown.length === 0 ? (
        <EmptyState>No copies yet. The copies appear here, one row each, when the pack is made.</EmptyState>
      ) : (
        // one column that never grows past the page's (minmax(0, 1fr)): a wide table scrolls in its own box
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {GROUPS.map((grp) => {
            const rows = shown.filter((s) => s.grp.key === grp.key).map((s) => s.p);
            if (!rows.length) return null;
            return (
              <section key={grp.key} aria-label={`${grp.label}, ${rows.length} copies`}>
                <h3 className="mb-1">{grp.label} <span className="b-count b-num">{rows.length}</span></h3>
                <DataTable label={grp.label} columns={copyColumns(grp.key, ctx)} rows={rows} rowKey={(p) => p.id} more={{ page: 1, href: () => assessmentHref(key) }} />
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
    </div>
  );
  // the board's panel, opened full page (page charter Part C): the same four tabs, the same reads, with this page's own acts and rows
  const keys = [{ key, qrs: a.qrs ?? [] }];
  const files = (await deadline(fileLinks(keys, me))).byKey.get(key) ?? [];
  const opened = await assessmentPanel(
    me,
    { key, openKey: `assessment:${openIdOf(key)}`, title: named.name, line: `${a.band ? g.name(a.band) : "Assessment"} · ${live.length} papers`, files, next: { href: assessmentHref(key), label: wait.action.label } },
    { kind, section, week, set },
    { closeHref: assessmentHref(key), here: assessmentHref(key), tab: q.tab, read: q.read, why: q.why, pages: q.pages, reading: !!card.reading },
    { actions, more: { copies: copiesMore }, replace: ["copies"] },
  );

  return (
    <Screen
      stage={`${a.band ? g.name(a.band) : "Assessment"} · ${live.length} papers`}
      title={named.name}
      purpose="The assessment chosen on the board, opened full page: its copies, its upload, the answers to check and its results. A copy is its own row with its own action."
      next={{ href: "/children", label: "Children" }}
      // with nothing of its own to press, the one main action is the way back to the board, the assessment open on it
      action={mainId ? undefined : <Link href={`/children/assessments?open=assessment:${openIdOf(key)}`} className="btn">Back to the board</Link>}
    >
      {q.said ? <p role="status" className="mb-3 p-3">{q.said}</p> : null}
      <DetailPanel inline open={opened} summary={{ title: "", stats: [] }} />
    </Screen>
  );
}
