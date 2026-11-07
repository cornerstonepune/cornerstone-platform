import { ArrowRight, ChevronLeft, ChevronRight, Coffee } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChipTag, Legend } from "@/components/educator/tags";
import { longDate } from "@/lib/educator/clock";
import { E } from "@/lib/educator/words";
import { classWords } from "@/lib/voice-types";
import { href, view } from "../_data";

// Build 1 of 3: the stack only (shadcn parts, the school's tokens, the design standard).
export default function Page() {
  const v = view();
  const { d } = v;
  const tap = "min-h-[var(--tap)] min-w-[var(--tap)]";
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <header className="mb-6">
        <p className="text-sm text-[var(--text-muted)]">{E.area}</p>
        <h1 className="text-3xl font-semibold">{E.today.title}</h1>
        <p className="mt-1 text-[var(--text-muted)]">{longDate(d.day)}. {E.today.purpose}</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" className={tap} aria-label={E.day.previous}><ChevronLeft /></Button>
          <Button variant="outline" className={`${tap} px-3`}>{E.day.now}</Button>
          <Button variant="outline" className={tap} aria-label={E.day.next}><ChevronRight /></Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
          {d.fortnight ? <Badge variant="outline" className="h-7 px-3">{E.fortnight(d.fortnight.number, d.week)}</Badge> : null}
        </div>
      </div>

      <nav aria-label={E.pickClass} className="mb-4 flex flex-wrap gap-2">
        {d.classes.map((c) => (
          <Button key={c.id} variant={c.id === d.class.id ? "default" : "outline"} aria-current={c.id === d.class.id ? "page" : undefined} className={`${tap} px-4`}>{classWords(c)}</Button>
        ))}
      </nav>

      <ul className="mb-6 flex flex-wrap gap-2" data-summary>
        {([[E.counts.periods, v.counts.periods], [E.counts.lessons, v.counts.lessons], [E.counts.breaks, v.counts.breaks], [E.counts.activities, v.counts.activities]] as const).map(([w, n]) => (
          <li key={w[1]}><Badge variant="outline" className="h-9 px-3 text-sm"><b className="tabular-nums">{n}</b> {w[n === 1 ? 0 : 1]}</Badge></li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-12">
        <aside aria-label={E.glance} className="grid content-start gap-4 lg:order-2 lg:col-span-4">
          <Card data-next>
            <CardHeader><CardTitle className="text-xl">{E.nextUp}</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {v.next ? (
                <>
                  <span className="text-sm tabular-nums text-[var(--text-muted)]">{v.time(v.next.p)}</span>
                  <span className="font-medium">{v.next.p.activity?.name ?? v.next.p.line ?? v.next.p.name}</span>
                  {v.next.chip ? <ChipTag chip={v.next.chip} /> : null}
                </>
              ) : <p className="text-[var(--text-muted)]">{E.nothingLeft}</p>}
            </CardContent>
          </Card>
          <section className="grid gap-2">
            <h2 className="text-sm font-medium text-[var(--text-muted)]">{E.legend}</h2>
            <Legend />
          </section>
        </aside>

        <ol aria-label={longDate(d.day)} className="grid gap-2 lg:order-1 lg:col-span-8">
          {v.work.map(({ p, chip }, i) => (
            <li key={p.period_id} className="grid gap-2">
              {v.line === i ? <div role="separator" aria-label={`${E.now} ${v.now}`} className="flex items-center gap-2 text-sm font-semibold"><span className="tabular-nums">{E.now} {v.now}</span><span className="h-1 flex-1 rounded-full bg-[var(--brand-basalt)]" /></div> : null}
              {p.kind === "empty" ? (
                <div className="grid min-h-[var(--tap)] content-center rounded-xl border border-dashed px-3 text-sm text-[var(--text-muted)]"><span className="tabular-nums">{v.time(p)}</span><span>{E.free}</span></div>
              ) : (
                <a href={href(p.period_id)} className="grid min-h-[var(--tap)] gap-1 rounded-xl border bg-[var(--surface)] px-3 py-3 no-underline hover:border-[var(--border-control)]" style={{ borderColor: chip ? `var(--chip-${chip === "doNow" ? "donow" : chip === "comingUp" ? "soon" : chip}-bd)` : undefined }}>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-sm tabular-nums text-[var(--text-muted)]">{p.kind === "fixed" ? <Coffee size={16} aria-hidden /> : null}{v.time(p)}</span>
                    {chip ? <ChipTag chip={chip} /> : null}
                  </span>
                  <span className={p.kind === "fixed" ? "text-[var(--text-muted)]" : "font-medium"}>{p.name}</span>
                  {p.kind !== "fixed" && (p.activity?.name ?? p.line) ? <span className="text-sm text-[var(--text-muted)]">{p.activity?.name ?? p.line}</span> : null}
                </a>
              )}
            </li>
          ))}
        </ol>
      </div>

      <nav aria-label="Next step" className="mt-8 border-t pt-4">
        <a href="?week" className={`${buttonVariants({ variant: "outline" })} min-h-[var(--tap)] px-4 no-underline`}>{E.week.title} <ArrowRight aria-hidden /></a>
      </nav>
    </main>
  );
}
