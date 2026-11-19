import Link from "@/components/link";
import { Card } from "@/components/cards";
import { DetailPanel, parseOpen } from "@/components/detail-panel";
import { EmptyState } from "@/components/empty-state";
import { Screen } from "@/components/app-frame";
import { requireStaff } from "@/lib/auth";
import { dayWords, myClaims } from "@/lib/money-claims";
import { rupees, type Claim } from "@/lib/money-format";
import { chipOf, claimPanel, Standing } from "./claim-panel";

// Money, My claims (CP-80, specs/CP-80/spec.md): every claim the person has filed, newest first, one card each with where it stands in words.
// A card opens in the detail panel (`?open=claim:<id>`): its details, its bill, Withdraw while submitted, Add the bill, File it again. Ten
// cards a page; the panel opens whichever page the claim is on.
const PAGE = 10;
type Q = Record<string, string | undefined>;

const at = (q: Q, change: Q) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...q, ...change })) if (v && k !== "filed" && k !== "said" && k !== "error") p.set(k, v);
  const s = p.toString();
  return s ? `/money?${s}` : "/money";
};

function ClaimCard({ c, q, open }: { c: Claim; q: Q; open: boolean }) {
  return (
    <li>
      <Card href={at(q, { open: `claim:${c.id}` })} scroll={false} data-open-key={`claim:${c.id}`} data-claim={c.status} aria-current={open ? "true" : undefined} className="grid gap-[var(--space-1)] min-[701px]:grid-cols-[minmax(0,3fr)_minmax(0,4fr)_auto] min-[701px]:items-center min-[701px]:gap-[var(--space-3)]">
        <span className="min-w-0">
          <b className="line-clamp-2 [overflow-wrap:anywhere]">{c.vendor}</b>
          <span className="b-muted b-label block [overflow-wrap:anywhere]">
            {dayWords(c.spent_on)} · {c.category}
          </span>
        </span>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-[var(--space-1)] b-label">
          {chipOf(c)}
          <span className="b-muted min-w-0 [overflow-wrap:anywhere]">
            <Standing c={c} />
          </span>
        </span>
        <b className="b-num whitespace-nowrap min-[701px]:text-right">{rupees(c.amount)}</b>
      </Card>
    </li>
  );
}

export default async function MyClaims({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireStaff();
  const q = await searchParams;
  const claims = await myClaims(me);
  const chosen = parseOpen(q.open);
  const opened = chosen?.kind === "claim" ? claims?.find((c) => c.id === chosen.id) : undefined;
  const pages = Math.max(1, Math.ceil((claims?.length ?? 0) / PAGE));
  const page = Math.min(pages, Math.max(1, Number(q.page) || 1));
  const shown = (claims ?? []).slice((page - 1) * PAGE, page * PAGE);
  const count = (f: (c: Claim) => boolean) => (claims ?? []).filter(f).length;
  const stats = [
    { id: "waiting", n: count((c) => c.status === "submitted" || c.status === "approved"), line: "waiting" },
    { id: "sent-back", n: count((c) => c.status === "sent back"), line: "sent back", tone: "act" as const },
    { id: "paid", n: count((c) => c.status === "paid"), line: "paid" },
  ].filter((s) => s.n > 0);
  const new_ = (
    <Link href="/money/new" className="btn" data-new-claim>
      New claim
    </Link>
  );
  return (
    <Screen stage="Money" title="My claims" purpose="What you spent for the school, and where each claim stands." action={new_} next={null} panel={<DetailPanel open={opened ? claimPanel(opened) : null} summary={{ title: "My claims", stats }} />}>
      {q.filed ? (
        <p role="status" data-said="filed" className="font-semibold">
          Filed. It is with {opened?.next.includes("founder") ? "a founder" : "your operations lead"}.
        </p>
      ) : null}
      {q.said === "withdrawn" ? (
        <p role="status" data-said="withdrawn" className="font-semibold">
          Withdrawn. It will not go any further.
        </p>
      ) : null}
      {q.error ? (
        <p role="alert" data-error className="text-[var(--state-late)]">
          {q.error}
        </p>
      ) : null}
      {claims === null ? <EmptyState>Your claims could not be read just now. Try again in a minute.</EmptyState> : null}
      {claims && !claims.length ? <EmptyState>You have not filed a claim yet. New claim, above, files your first.</EmptyState> : null}
      {shown.length ? (
        <section aria-label="My claims" className="grid gap-[var(--space-2)]" data-claims>
          <ul className="grid gap-[var(--space-2)]">
            {shown.map((c) => (
              <ClaimCard key={c.id} c={c} q={q} open={c.id === opened?.id} />
            ))}
          </ul>
          {pages > 1 ? (
            <nav aria-label="Pages of claims" className="flex flex-wrap items-center gap-[var(--space-2)] b-label">
              {page > 1 ? (
                <Link href={at(q, { page: page > 2 ? String(page - 1) : undefined })} className="b-btn">
                  Newer
                </Link>
              ) : null}
              <span className="b-muted b-num">
                Claims {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, claims?.length ?? 0)} of {(claims?.length ?? 0).toLocaleString("en-IN")}
              </span>
              {page < pages ? (
                <Link href={at(q, { page: String(page + 1) })} className="b-btn">
                  Older
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      ) : null}
    </Screen>
  );
}
