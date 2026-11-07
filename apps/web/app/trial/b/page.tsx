import { ArrowRight, ChevronLeft, ChevronRight, Coffee } from "lucide-react";
import { ChipTag, Legend } from "@/components/educator/tags";
import { longDate } from "@/lib/educator/clock";
import { E } from "@/lib/educator/words";
import { classWords } from "@/lib/voice-types";
import { href, view } from "../_data";

// Build 2 of 3: the stack plus an editorial, plain-spoken approach: one dark band that says what is on now, a quiet ledger below.
const lift = "transition duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0";
export default function Page() {
  const v = view();
  const { d } = v;
  const now = v.next;
  const rest = v.work;
  return (
    <main>
      <section className="bg-[var(--brand-basalt)] text-[var(--brand-paper)]">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:px-8 md:py-12">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>{longDate(d.day)} · {classWords(d.class)}</span>
            <span className="flex items-center gap-2">
              <a href="?back" aria-label={E.day.previous} className="inline-flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center rounded-xl border border-white/40 hover:bg-white/10"><ChevronLeft aria-hidden /></a>
              <a href="?next" aria-label={E.day.next} className="inline-flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center rounded-xl border border-white/40 hover:bg-white/10"><ChevronRight aria-hidden /></a>
            </span>
          </div>
          <div className="grid gap-2">
            <h1 className="text-sm font-medium text-[var(--brand-sand)]">{E.today.title}: {v.counts.lessons} lessons, {v.counts.breaks} breaks</h1>
            {now ? (
              <>
                <p className="text-5xl leading-tight font-semibold md:text-7xl">{now.p.activity?.name ?? now.p.line}</p>
                <p className="text-lg tabular-nums text-[var(--brand-sand)]">{now.p.name} · {v.time(now.p)}</p>
              </>
            ) : <p className="text-4xl font-semibold">{E.nothingLeft}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {now ? <a href={href(now.p.period_id)} className={`${lift} inline-flex min-h-[var(--tap)] items-center gap-2 rounded-xl bg-[var(--brand-paper)] px-5 text-base font-medium text-[var(--brand-basalt)] no-underline hover:bg-[var(--brand-sand-pale)]`}>Open this period <ArrowRight aria-hidden /></a> : null}
            {v.after ? <span className="tabular-nums text-[var(--brand-sand)]">Then {v.after.p.activity?.name ?? v.after.p.name} {v.soon}</span> : null}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <nav aria-label={E.pickClass} className="mb-6 flex flex-wrap gap-2">
          {d.classes.map((c) => (
            <a key={c.id} href="?class" aria-current={c.id === d.class.id ? "page" : undefined} className={`inline-flex min-h-[var(--tap)] items-center rounded-xl border px-4 no-underline ${c.id === d.class.id ? "border-[var(--brand-basalt)] bg-[var(--brand-basalt)] text-[var(--brand-paper)]" : "border-[var(--border-control)]"}`}>{classWords(c)}</a>
          ))}
        </nav>
        <h2 className="mb-4 text-2xl font-semibold">All {v.counts.periods} periods</h2>
        <ol aria-label={longDate(d.day)} className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {rest.map(({ p, chip }) => (
            <li key={p.period_id}>
              {p.kind === "empty" ? (
                <div className="grid grid-cols-[6.5rem_1fr] gap-4 py-4 text-[var(--text-muted)] md:grid-cols-[9rem_1fr]"><span className="tabular-nums">{v.time(p)}</span><span>{E.free}</span></div>
              ) : (
                <a href={href(p.period_id)} className={`grid grid-cols-[6.5rem_1fr] items-start gap-4 py-4 no-underline md:grid-cols-[9rem_1fr_auto] ${lift}`}>
                  <span className="tabular-nums text-lg font-semibold">{p.starts_at}</span>
                  <span className="grid gap-1">
                    <span className={`inline-flex items-center gap-2 ${p.kind === "fixed" ? "text-[var(--text-muted)]" : "text-lg font-medium"}`}>{p.kind === "fixed" ? <Coffee size={16} aria-hidden /> : null}{p.name}</span>
                    {p.kind !== "fixed" && (p.activity?.name ?? p.line) ? <span className="text-[var(--text-muted)]">{p.activity?.name ?? p.line}</span> : null}
                    <span className="text-sm tabular-nums text-[var(--text-muted)]">{v.time(p)}</span>
                  </span>
                  {chip ? <span className="col-start-2 md:col-start-3"><ChipTag chip={chip} /></span> : null}
                </a>
              )}
            </li>
          ))}
        </ol>
        <section className="mt-8 grid gap-2">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">{E.legend}</h2>
          <Legend />
        </section>
        <a href="?week" className={`${lift} mt-8 inline-flex min-h-[var(--tap)] items-center gap-2 rounded-xl border border-[var(--border-control)] px-5 no-underline`}>{E.week.title} <ArrowRight aria-hidden /></a>
      </div>
    </main>
  );
}
