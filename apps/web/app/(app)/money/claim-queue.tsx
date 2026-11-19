import type { ReactNode } from "react";
import Link from "@/components/link";
import { Card } from "@/components/cards";
import { Screen } from "@/components/app-frame";
import { DetailPanel, parseOpen, type Opened } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { KeyValue } from "@/components/key-value";
import type { Arrived } from "@/lib/arrived-words";
import { rupees, type Waiting } from "@/lib/money-format";
import { QUEUES, dayWords, queueAt, type Got, type Queue } from "@/lib/money-queue";
import { pageOf } from "@/lib/ux-rules";
import { arrivedPanel } from "./arrived-panel";
import { BillPicture } from "./bill-picture";

// A queue of claims waiting on this person (CP-80): To approve and To pay are this one screen with two kinds of work. The list is oldest first, ten to a page;
// a claim opens in the detail panel with its bill large; the page that decides it hands over what to do (`work`), and what comes next is its server action's.
export type Q = { open?: string; page?: string; did?: string; said?: string; tab?: string };
export type Work = { actions: ReactNode };

const COPY = {
  approve: { title: "To approve", purpose: "Claims at your campus, oldest first. Approve or send back.", waiting: "waiting for you" },
  pay: { title: "To pay", purpose: "Approved claims, oldest first. Mark each one when paid.", waiting: "to pay" },
} as const;
const DID: Record<string, string> = { approved: "Approved.", sent_back: "Sent back.", paid: "Marked paid." };

function Row({ c, queue, page, selected }: { c: Waiting; queue: Queue; page: number; selected: boolean }) {
  return (
    <Card as="li" flush className="b-kitem">
      <Link
        href={queueAt(queue, { open: c.id, page })}
        scroll={false}
        data-open-key={`claim:${c.id}`}
        data-claim-row={c.id}
        aria-current={selected ? "true" : undefined}
        aria-controls={selected ? "detail-panel" : undefined}
        title={`${c.vendor}, ${rupees(c.amount)}`}
        className={`b-kcard grid-cols-[auto_minmax(0,1fr)_auto] items-center max-[600px]:grid-cols-[auto_minmax(0,1fr)]${selected ? " b-selected" : ""}`}
        data-press=""
      >
        <BillPicture id={c.id} has={c.has_bill} small />
        <span className="min-w-0">
          <b className="b-ktitle">{c.vendor}</b>
          <span className="b-sub">
            {c.claimant} · {dayWords(c.spent_on)}
          </span>
        </span>
        <span className="b-num whitespace-nowrap font-semibold max-[600px]:col-start-2" data-claim-amount>
          {rupees(c.amount)}
        </span>
      </Link>
    </Card>
  );
}

/** The panel of an open claim: under the title the amount large and what the person does with it, then what it was for and the bill large. */
function opened(c: Waiting, queue: Queue, page: number, work: Work, arrived: Got<Arrived> | null | undefined, tab: string | undefined): Opened {
  const got = arrivedPanel(c.id, arrived);
  const rows = [
    { label: "Date", value: dayWords(c.spent_on) },
    { label: "For", value: c.category },
    { label: "Campus", value: c.campus },
    ...(c.note ? [{ label: "Note", value: <span className="[overflow-wrap:anywhere]">{c.note}</span> }] : []),
  ];
  return {
    key: `claim:${c.id}`,
    kind: "note",
    title: c.vendor,
    line: `Filed by ${c.claimant}`,
    closeHref: queueAt(queue, { page }),
    lead: (
      <p className="b-num text-[length:var(--text-title-page)] font-semibold leading-tight [overflow-wrap:anywhere]" data-claim-amount>
        {rupees(c.amount)}
      </p>
    ),
    actions: (
      <>
        {work.actions}
        {got.actions}
      </>
    ),
    tab,
    tabs: [
      {
        key: "claim",
        label: "The claim",
        body: (
          <div className="grid gap-[var(--space-3)]" data-claim-open={c.id}>
            <KeyValue rows={rows} />
            <BillPicture id={c.id} has={c.has_bill} />
            {c.has_bill ? (
              <a href={`/money/bill/${c.id}`} target="_blank" rel="noreferrer" className="btn tertiary -ml-[var(--space-2)] w-fit">
                Open the bill
              </a>
            ) : null}
          </div>
        ),
      },
      ...(got.tab ? [got.tab] : []),
    ],
  };
}

/** `arrived`: what the engine says arrived against the open claim, for a keeper of its campus (the page asks, as only it knows who is signed in). */
export function ClaimQueue({ queue, claims, q, work, arrived }: { queue: Queue; claims: readonly Waiting[]; q: Q; work: (c: Waiting, next: string) => Work; arrived?: Got<Arrived> | null }) {
  const copy = COPY[queue];
  const chosen = parseOpen(q.open);
  const at = chosen?.kind === "claim" ? claims.findIndex((c) => c.id === chosen.id) : -1;
  // the page holding the open claim, unless the address names another
  const shown = pageOf(claims, Number(q.page) || (at >= 0 ? Math.floor(at / 10) + 1 : 1));
  const open = at >= 0 ? claims[at] : null;
  // the claim that follows the open one (the first other, from the last): what the server action opens when this one is decided
  const next = open ? (claims[at + 1] ?? claims.find((c) => c.id !== open.id))?.id ?? "" : "";
  const did = DID[q.did ?? ""];
  return (
    <Screen
      stage="Money"
      title={copy.title}
      purpose={copy.purpose}
      next={{ href: "/money", label: "My claims" }}
      panel={!claims.length && !open ? undefined : <DetailPanel open={open ? opened(open, queue, shown.page, work(open, next), arrived, q.tab) : null} summary={{ title: copy.title, stats: claims.length ? [{ id: "waiting", n: claims.length, line: copy.waiting }] : [] }} />}
    >
      {did ? (
        <p role="status" className="font-semibold" data-said="done">
          {did} {claims.length ? `${claims.length} ${copy.waiting}.` : ""}
        </p>
      ) : null}
      {q.said ? (
        <p role="alert" className="font-semibold text-[var(--state-late)]" data-said="refused">
          {q.said.slice(0, 300)}
        </p>
      ) : null}
      {claims.length ? (
        <section aria-label={copy.title} className="grid min-w-0 gap-[var(--space-2)]">
          <ul className="m-0 grid list-none gap-[var(--space-2)] p-0" data-claim-list>
            {shown.rows.map((c) => (
              <Row key={c.id} c={c} queue={queue} page={shown.page} selected={c.id === open?.id} />
            ))}
          </ul>
          {shown.pages > 1 ? (
            <nav className="mt-[var(--space-1)] flex items-center gap-[var(--space-3)] text-[length:var(--text-label)]" aria-label={`${copy.title} pages`}>
              {shown.page > 1 ? <Link href={queueAt(queue, { page: shown.page - 1 })} className="chip">← Earlier</Link> : null}
              <span>
                Page {shown.page} of {shown.pages}
              </span>
              {shown.page < shown.pages ? <Link href={queueAt(queue, { page: shown.page + 1 })} className="chip">Later →</Link> : null}
            </nav>
          ) : null}
        </section>
      ) : (
        <EmptyState>{QUEUES[queue].empty}</EmptyState>
      )}
    </Screen>
  );
}
