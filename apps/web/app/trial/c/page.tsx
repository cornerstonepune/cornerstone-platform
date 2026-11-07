import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ChipTag, Legend } from "@/components/educator/tags";
import { longDate } from "@/lib/educator/clock";
import { E } from "@/lib/educator/words";
import { classWords } from "@/lib/voice-types";
import { href, view } from "../_data";

// Build 3 of 3: the stack plus a calendar approach: a time axis, blocks as tall as the period, flat, quick (150 ms) feedback.
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const PX = 2.4; // pixels a minute
const quick = "transition-colors duration-150 motion-reduce:transition-none";
export default function Page() {
  const v = view();
  const { d } = v;
  const start = mins(d.periods[0].starts_at);
  const endOf = (p: (typeof d.periods)[number]) => mins(p.ends_at ?? p.starts_at) + (p.ends_at ? 0 : 40);
  const height = (endOf(d.periods[d.periods.length - 1]) - start) * PX;
  const nowTop = (mins(v.now) - start) * PX;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{E.today.title}</h1>
          <p className="text-[var(--text-muted)]">{longDate(d.day)} · {classWords(d.class)}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="?back" aria-label={E.day.previous} className={`${buttonVariants({ variant: "outline" })} ${quick} min-h-[var(--tap)] min-w-[var(--tap)] no-underline`}><ChevronLeft aria-hidden /></a>
          <a href="?today" className={`${buttonVariants({ variant: "outline" })} ${quick} min-h-[var(--tap)] px-4 no-underline`}>{E.day.now}</a>
          <a href="?next" aria-label={E.day.next} className={`${buttonVariants({ variant: "outline" })} ${quick} min-h-[var(--tap)] min-w-[var(--tap)] no-underline`}><ChevronRight aria-hidden /></a>
        </div>
      </header>

      {v.next ? (
        <a href={href(v.next.p.period_id)} data-next className={`${quick} mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--brand-monsoon-deep)] bg-[var(--brand-monsoon-wash)] p-4 no-underline hover:bg-[var(--brand-monsoon-lt)] lg:hidden`}>
          <span className="grid"><span className="text-sm font-medium">{E.nextUp}</span><span className="text-lg font-semibold">{v.next.p.activity?.name ?? v.next.p.name}</span><span className="text-sm tabular-nums">{v.time(v.next.p)}</span></span>
          {v.next.chip ? <ChipTag chip={v.next.chip} /> : null}
        </a>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <nav aria-label={E.pickClass} className="mb-4 flex flex-wrap gap-2">
            {d.classes.map((c) => (
              <a key={c.id} href="?class" aria-current={c.id === d.class.id ? "page" : undefined} className={`${quick} inline-flex min-h-[var(--tap)] items-center rounded-full border px-4 no-underline ${c.id === d.class.id ? "border-[var(--brand-monsoon-deep)] bg-[var(--brand-monsoon-deep)] text-[var(--brand-paper)]" : "border-[var(--border-control)] hover:bg-[var(--sunken)]"}`}>{classWords(c)}</a>
            ))}
          </nav>
          <div className="relative ml-14 border-l border-[var(--border)] md:ml-16" style={{ height }}>
          <ol aria-label={longDate(d.day)}>
            {d.periods.map((p) => {
              const top = (mins(p.starts_at) - start) * PX;
              const h = Math.max((endOf(p) - mins(p.starts_at)) * PX - 4, 44);
              const chip = v.work.find((w) => w.p === p)!.chip;
              const quiet = p.kind === "fixed" || p.kind === "empty";
              return (
                <li key={p.period_id} className="absolute right-0 left-0 z-10" style={{ top, height: h }}>
                  <span className="absolute -left-14 -mt-2 w-12 text-right text-sm tabular-nums text-[var(--text-muted)] md:-left-16 md:w-14">{p.starts_at}</span>
                  {p.kind === "empty" ? (
                    <div className="ml-3 h-full rounded-lg border border-dashed px-3 py-2 text-sm text-[var(--text-muted)]">{E.free}</div>
                  ) : (
                    <a href={href(p.period_id)} className={`${quick} ml-3 flex h-full flex-wrap content-start items-start justify-between gap-x-3 overflow-hidden rounded-lg border px-3 py-2 no-underline hover:border-[var(--border-control)] ${quiet ? "bg-[var(--sunken)] text-[var(--text-muted)]" : "bg-[var(--surface)]"}`} style={chip ? { borderColor: `var(--chip-${chip === "doNow" ? "donow" : chip === "comingUp" ? "soon" : chip}-bd)` } : undefined}>
                      <span className="grid">
                        <span className={quiet ? "" : "font-semibold"}>{p.name}</span>
                        {!quiet && (p.activity?.name ?? p.line) ? <span className="text-sm text-[var(--text-muted)]">{p.activity?.name ?? p.line}</span> : null}
                      </span>
                      {chip ? <ChipTag chip={chip} /> : null}
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
            <div role="separator" aria-label={`${E.now} ${v.now}`} className="pointer-events-none absolute right-0 -left-14 z-0 flex items-center gap-1 md:-left-16" style={{ top: nowTop }}>
              <span className="w-12 rounded bg-[var(--brand-basalt)] px-1 text-center text-sm font-semibold tabular-nums text-[var(--brand-paper)] md:w-14">{v.now}</span>
              <span className="h-0.5 flex-1 bg-[var(--brand-basalt)]" />
            </div>
          </div>
        </div>

        <aside aria-label={E.glance} className="hidden content-start gap-5 lg:order-last lg:col-span-4 lg:grid">
          {v.next ? (
            <section className="grid gap-2 rounded-xl border border-[var(--brand-monsoon-deep)] bg-[var(--brand-monsoon-wash)] p-4">
              <h2 className="text-sm font-medium">{E.nextUp}</h2>
              <span className="text-xl font-semibold">{v.next.p.activity?.name ?? v.next.p.name}</span>
              <span className="text-sm tabular-nums">{v.time(v.next.p)}</span>
              {v.next.chip ? <ChipTag chip={v.next.chip} /> : null}
            </section>
          ) : null}
          <ul className="flex flex-wrap gap-2" data-summary>
            {([[E.counts.periods, v.counts.periods], [E.counts.lessons, v.counts.lessons], [E.counts.breaks, v.counts.breaks], [E.counts.activities, v.counts.activities]] as const).map(([w, n]) => (
              <li key={w[1]}><Badge variant="outline" className="h-8 px-3 text-sm"><b className="tabular-nums">{n}</b> {w[n === 1 ? 0 : 1]}</Badge></li>
            ))}
          </ul>
          <section className="grid gap-2"><h2 className="text-sm font-medium text-[var(--text-muted)]">{E.legend}</h2><Legend /></section>
        </aside>
      </div>

      <section className="mt-6 grid gap-2 lg:hidden"><h2 className="text-sm font-medium text-[var(--text-muted)]">{E.legend}</h2><Legend /></section>
      <nav aria-label="Next step" className="mt-8 border-t pt-4">
        <a href="?week" className={`${buttonVariants({ variant: "outline" })} ${quick} min-h-[var(--tap)] px-4 no-underline`}>{E.week.title} <ArrowRight aria-hidden /></a>
      </nav>
    </main>
  );
}
