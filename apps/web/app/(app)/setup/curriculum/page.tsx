import Link from "@/components/link";
import { Cards } from "@/components/cards";
import { DataTable } from "@/components/data-table";
import { Details } from "@/components/details";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { KindTile } from "@/components/kind-tile";
import { Rail, Screen, type Edge } from "@/components/app-frame";
import { StatusChip } from "@/components/status-chip";
import { requireStaff } from "@/lib/auth";
import { deadline } from "@/lib/deadline";
import { curriculumRows, type CRow } from "@/lib/curriculum-rows";
import { gateFor, linked, readOffers, waiting } from "@/lib/curriculum-screens";
import { grades as schoolGrades } from "@/lib/queries";
import { asks, ROLE_WORDS, type Ask } from "@/lib/queries-people";
import { dateWords } from "@/lib/week";
import { scopeOf } from "@/lib/scope";
import type { Column } from "@/lib/ux-rules";
import { answerOffer } from "../../curriculum/actions";
import { answerAsk } from "../../asks/actions";

type Q = Record<string, string | undefined>;
const HERE = "/setup/curriculum";
const STATUS: [string, string][] = [["drafted", "Drafted parts to check"], ["waiting", "Levels to approve"], ["complete", "Complete"]];
const RAIL: Edge[] = [
  { screen: "skills-approve", label: "Skills to approve", icon: "skill" },
  { screen: "bank", label: "Question bank", icon: "assessment" },
];
const part = (n: number, w: string) => (n ? `${n} ${w}` : "");

// Curriculum: every activity (K2) and skill (grades 1 to 4) in one list under one filter row, how much of each page is
// filled in and by whom; the drafted parts waiting for a person, and the skills the machine offers for an activity, each
// answered on its own row (Yes adds the link, No closes the offer). Opening a row reads it. The count of skills to
// approve is not here: it is the eyebrow of Skills to approve and nowhere else.
export default async function Curriculum({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const gate = await gateFor(me.email);
  const reviews = gate?.reviews ?? false;
  const q = await searchParams;
  const [school, drafts, offers, allAsks] = await deadline(Promise.all([schoolGrades(), gate ? waiting() : Promise.resolve([]), gate ? readOffers(me.email).catch(() => []) : Promise.resolve([]), asks()]));
  const all = await deadline(curriculumRows(school, scopeOf(me), gate !== null));

  const pick = (v: string | undefined, ok: Iterable<string>) => (v && [...ok].includes(v) ? v : undefined);
  const grade = pick(q.grade, all.map((r) => r.band));
  const subject = pick(q.subject, all.map((r) => r.subject).filter(Boolean));
  const topic = pick(q.topic, all.map((r) => r.topic).filter(Boolean));
  const status = pick(q.status, STATUS.map(([v]) => v));
  const text = (q.q ?? "").trim().toLowerCase();
  const rank = { drafted: 0, waiting: 1, complete: 2 } as const;
  const order = (r: CRow) => school.list.findIndex((g) => g.code === r.band);
  const rows = all
    .filter((r) => (!grade || r.band === grade) && (!subject || r.subject === subject) && (!topic || r.topic === topic) && (!status || r.status === status) && (!text || r.name.toLowerCase().includes(text) || r.code.toLowerCase().includes(text)))
    .sort((a, b) => rank[a.status] - rank[b.status] || order(a) - order(b) || a.topic.localeCompare(b.topic) || a.name.localeCompare(b.name));
  const page = Math.max(1, Math.trunc(Number(q.page)) || 1);
  const opage = Math.min(Math.max(1, Math.trunc(Number(q.opage)) || 1), Math.max(1, Math.ceil(offers.length / 10)));
  const open = allAsks.filter((a) => !a.answer);
  const mineFirst = [...open.filter((a) => a.for_role === me.role), ...open.filter((a) => a.for_role !== me.role)];
  const answered = allAsks.filter((a) => a.answer);
  const apage = Math.min(Math.max(1, Math.trunc(Number(q.apage)) || 1), Math.max(1, Math.ceil(mineFirst.length / 10)));
  const keep = { grade, subject, topic, status, q: q.q?.trim() || undefined };
  // an address of this screen: the choices and the page of each table (the list, the offers, the questions to answer), each paging on its own
  const at = (p: number, o: number, a = apage) => {
    const s = new URLSearchParams(Object.entries({ ...keep, page: p > 1 ? String(p) : undefined, opage: o > 1 ? String(o) : undefined, apage: a > 1 ? String(a) : undefined }).flatMap(([k, v]) => (v ? [[k, v]] : [])));
    return s.size ? `${HERE}?${s}` : HERE;
  };
  const href = (p: number) => at(p, opage);
  const offersHref = (o: number) => at(page, o);
  const asksHref = (a: number) => `${at(page, opage, a)}#asks`;
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort().map((x): [string, string] => [x, x]);

  const columns: Column<CRow>[] = [
    {
      key: "name",
      label: "Activity or skill",
      value: (r) => r.name,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <KindTile kind={r.kind} />
          <Link href={r.href} {...{ [`data-${r.kind}-row`]: "" }}>{r.name}</Link>
        </span>
      ),
    },
    { key: "grade", label: "Grade", value: (r) => r.grade, width: "7rem" },
    { key: "subject", label: "Subject", value: (r) => r.subject, width: "9rem" },
    { key: "topic", label: "Topic", value: (r) => r.topic, width: "11rem" },
    { key: "levels", label: "Levels", value: (r) => r.levels, num: true, width: "5rem" },
    {
      key: "filled",
      label: "Filled",
      value: (r) => (r.kind === "skill" ? `${r.fill.school} of ${r.levels} levels approved` : [part(r.fill.school, "school"), part(r.fill.drafted, "drafted"), part(r.fill.person, "person"), part(r.fill.empty, "empty")].filter(Boolean).join(" · ")),
      width: "15rem",
    },
    {
      key: "status",
      label: "Status",
      value: (r) => r.status,
      cell: (r) =>
        r.status === "drafted" ? (
          <StatusChip state="toCheck" words={`${r.fill.drafted} drafted to check`} />
        ) : r.status === "waiting" ? (
          <StatusChip state="toApprove" />
        ) : (
          <StatusChip state="done" words="complete" />
        ),
      status: true,
      width: "12rem",
    },
  ];

  // a question is drafted for a role: its own role answers it, and the coordinator may answer any (the engine checks it again)
  const mayAnswer = (a: Ask) => me.role === a.for_role || me.role === "coordinator";
  const firstDraft = drafts[0];
  const draftHref = firstDraft ? `/setup/activities/${firstDraft.code}` : null;
  // every offer is reachable: ten a page, the page the person is on kept in the address
  const shownOffers = offers.slice((opage - 1) * 10, opage * 10);
  const had = await linked([...new Set(shownOffers.map((o) => o.activity.code))]);
  const offerColumns: Column<(typeof offers)[number]>[] = [
    { key: "activity", label: "Activity", value: (o) => o.activity.name, cell: (o) => <span className="flex items-center gap-2"><KindTile kind="activity" />{o.activity.name}</span> },
    { key: "offered", label: "Skills offered", value: (o) => o.skills.map((s) => s.name).join(", ") },
    { key: "linked", label: "Already linked", value: (o) => (had.get(o.activity.code) ?? []).map((s) => s.name).join(", ") },
    { key: "why", label: "Why", value: (o) => o.reason },
    {
      key: "answer",
      label: "",
      keep: true,
      value: () => "answer",
      cell: (o) =>
        reviews ? (
          <form action={answerOffer} className="flex gap-2">
            <input type="hidden" name="id" value={o.id} />
            <input type="hidden" name="back" value={at(page, opage)} />
            <button type="submit" name="do" value="yes" className="btn" data-offer-yes>Yes<span className="sr-only"> add the offered skills to {o.activity.name}</span></button>
            <button type="submit" name="do" value="no" className="btn secondary" data-offer-no>No<span className="sr-only"> close the offer for {o.activity.name}</span></button>
          </form>
        ) : null,
      width: "11rem",
    },
  ];

  const askColumns: Column<Ask>[] = [
    { key: "question", label: "Question", value: (a) => a.question, cell: (a) => <span className="flex items-center gap-2"><KindTile kind="objective" />{a.question}</span> },
    { key: "for", label: "For", value: (a) => ROLE_WORDS[a.for_role] ?? a.for_role, width: "9rem" },
    { key: "drafted", label: "What was drafted", value: (a) => a.drafted },
    { key: "why", label: "Why", value: (a) => a.why ?? "" },
    { key: "link", label: "", value: (a) => (a.link ? "read" : ""), cell: (a) => (a.link ? <a href={a.link} target="_blank" rel="noreferrer" data-ask-link>Read it in full<span className="sr-only"> ({a.question})</span></a> : null), width: "7rem" },
    {
      key: "answer",
      label: "",
      keep: true,
      value: () => "answer",
      cell: (a) =>
        mayAnswer(a) ? (
          <div className="grid gap-2">
            <form action={answerAsk}>
              <input type="hidden" name="code" value={a.code} />
              <input type="hidden" name="answer" value="agreed" />
              <input type="hidden" name="back" value={`${at(page, opage)}#asks`} />
              <button type="submit" className="btn" data-ask-agree>Agree as drafted<span className="sr-only"> ({a.question}), as {me.name}</span></button>
            </form>
            <form action={answerAsk} className="grid gap-1">
              <input type="hidden" name="code" value={a.code} />
              <input type="hidden" name="answer" value="corrected" />
              <input type="hidden" name="back" value={`${at(page, opage)}#asks`} />
              <label className="grid gap-1 text-[13px]">
                <span>What it should say<span className="sr-only"> ({a.question})</span></span>
                <textarea name="correction" rows={2} className="border border-[var(--line)] p-2" data-ask-correction />
              </label>
              <button type="submit" className="btn secondary" data-ask-correct>Correct it<span className="sr-only"> ({a.question}), as {me.name}</span></button>
            </form>
          </div>
        ) : null,
      width: "17rem",
    },
  ];

  return (
    <Screen
      stage="Every grade"
      title="Curriculum"
      purpose="Every activity and skill of every grade, with its levels and how much of each page is filled in. Open one to read it."
      next={{ href: "/setup/skills/approve", label: "Skills to approve" }}
      action={draftHref ? <Link href={draftHref} className="btn">Check the drafted parts</Link> : <p className="text-[14px]">No drafted parts wait for a person.</p>}
      rail={<Rail edges={RAIL} />}
    >
      <Cards
        cards={[
          { kind: "activity", title: "Drafts to check", line: `${drafts.length} drafted ${drafts.length === 1 ? "part waits" : "parts wait"} for a person.` },
          { kind: "objective", title: "Questions to answer", line: `${open.length} ${open.length === 1 ? "waits" : "wait"} for a person, ${open.filter((a) => a.for_role === me.role).length} for you.`, ...(open.length ? { href: "#asks", link: "Read them" } : {}) },
        ]}
      />
      <FilterBar
        action={HERE}
        filters={[
          { name: "grade", label: "Grade", value: grade, all: "Every grade", options: school.list.filter((g) => all.some((r) => r.band === g.code)).map((g): [string, string] => [g.code, g.name]) },
          { name: "subject", label: "Subject", value: subject, all: "Every subject", options: uniq(all.map((r) => r.subject)) },
          { name: "topic", label: "Topic", value: topic, all: "Every topic", options: uniq(all.map((r) => r.topic)) },
          { name: "status", label: "Status", value: status, all: "Any status", options: STATUS },
        ]}
        search={{ name: "q", value: q.q?.trim(), placeholder: "Name or code" }}
      />
      {rows.length === 0 ? (
        <EmptyState next={{ href: HERE, label: "Clear the choices" }}>Nothing matches those choices.</EmptyState>
      ) : (
        <DataTable label="Activities and skills" columns={columns} rows={rows} rowKey={(r) => `${r.kind}:${r.code}`} more={{ page, href }} extras={{ attrs: (r) => ({ "data-row": r.code }) }} />
      )}
      {shownOffers.length ? (
        <section className="mt-6" aria-label="Offers waiting" data-offers>
          <h2 className="mb-2 text-[16px]">Offers waiting</h2>
          <p className="mb-2 text-[13px] text-[var(--ink-muted)]">Skills the machine offers for an activity the examples did not show. Yes adds the skill to that activity; No closes the offer.</p>
          <DataTable label="Offers" columns={offerColumns} rows={offers} rowKey={(o) => o.id} more={{ page: opage, href: offersHref }} extras={{ attrs: (o) => ({ "data-offer": o.id }) }} />
        </section>
      ) : null}
      <section className="mt-6" aria-label="Questions to answer" id="asks" data-asks>
        <h2 className="mb-2 text-[16px]">Questions to answer</h2>
        <p className="mb-2 text-[13px] text-[var(--ink-muted)]">What the engine drafted about the curriculum and wants a person to agree with or correct. Your name goes on the answer.</p>
        {q.empty ? <p role="status" className="mb-2 text-[13px] text-[var(--ink-muted)]">A correction needs its words: write what it should say.</p> : null}
        {mineFirst.length ? (
          <DataTable label="Questions waiting" columns={askColumns} rows={mineFirst} rowKey={(a) => a.code} more={{ page: apage, href: asksHref }} extras={{ attrs: (a) => ({ "data-ask": a.code }) }} />
        ) : (
          <p className="text-[14px]">Every question is answered.</p>
        )}
        {answered.length ? (
          <div className="mt-3">
            <Details summary={`Read the ${answered.length} answered`} name="answered-asks">
              <ul className="grid gap-3 text-[13.5px]">
                {answered.map((a) => (
                  <li key={a.code}>
                    <b>{a.question}</b>
                    <span className="block text-[var(--ink-muted)]">{a.answer === "agreed" ? "Agreed as drafted" : "Corrected"} by {a.answered_by}, {dateWords(a.answered_at)}</span>
                    {a.correction ? <span className="block">It should say: {a.correction}</span> : null}
                  </li>
                ))}
              </ul>
            </Details>
          </div>
        ) : null}
      </section>
    </Screen>
  );
}
