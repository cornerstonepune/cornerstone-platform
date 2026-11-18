"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as RPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/cards";
import { StatusChip, type State } from "@/components/status-chip";
import { DataTable } from "@/components/data-table";
import { TABLE_ROW_LIMIT, type Column } from "@/lib/ux-rules";
import { markAnswer, tellWritten, type Mark as Said } from "./mark-action";

// Checking a paper (CP-62, simplified 18 Nov): one table of every question (the right answer, what the system read, what it says) beside the whole
// page as uploaded, with zoom. No per-question crops: the educator reads the child's page itself. Where the system is unsure, the educator types what
// the child wrote and the engine marks it (code does the arithmetic), or presses right, wrong, wrong with working or blank: the three signals stay three.
export type Mark = "right" | "wrong" | "working" | "blank" | "judge";
export type Q = {
  id: string;
  label: string;
  question: string;
  mark: Mark;
  /** a person may say right, wrong or blank for it now: the engine left it to them and holds nothing back */
  canJudge: boolean;
  capture: string;
  page: number;
  box: number[] | null;
  /** the question's own region is known on its page (else the whole page is shown, and says so) */
  outlined: boolean;
  /** a person has already put their hand to it (counted in "n of m judged") */
  touched: boolean;
  /** the right answer the engine holds */
  answer: string | null;
  /** what the system read the child wrote: a person's word, else the engine's reading, else its guess */
  read: string | null;
  /** where a person can change it (the answer's own tools) */
  href: string;
  /** the same address with the answer's tools closed */
  close: string;
};
const CHIP: Record<Mark, { state: State; words: string }> = {
  right: { state: "right", words: "Right" },
  wrong: { state: "wrong", words: "Wrong" },
  working: { state: "wrong", words: "Wrong, with working" },
  blank: { state: "blank", words: "Blank" },
  judge: { state: "judge", words: "For you to judge" },
};
const BUTTONS: { key: "1" | "2" | "3" | "4"; mark: Said; words: string }[] = [
  { key: "1", mark: "right", words: "Right" },
  { key: "2", mark: "wrong", words: "Wrong" },
  { key: "3", mark: "working", words: "Wrong with working" },
  { key: "4", mark: "blank", words: "Blank" },
];
const MIN = 1;
const MAX = 6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A picture to look at closely: zoom buttons, the wheel, a pinch, and a drag to move about it. A page photographed sideways is turned upright
 *  (a landscape photograph of a portrait page is a quarter turn out), and Rotate turns it by hand where that guess is wrong. */
function Zoom({ src, alt, outline }: { src: string; alt: string; outline?: number[] | null }) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [turn, setTurn] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef<{ d: number; x: number; y: number } | null>(null);
  const to = useCallback((s: number, ax: number, ay: number) => {
    // zoom about the point (ax, ay) of the frame, so what is under the finger stays under it
    setView((v) => {
      const n = clamp(s, MIN, MAX);
      if (n === MIN) return { s: MIN, x: 0, y: 0 };
      const k = n / v.s;
      return { s: n, x: ax - (ax - v.x) * k, y: ay - (ay - v.y) * k };
    });
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => {
        const n = clamp(v.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), MIN, MAX);
        if (n === MIN) return { s: MIN, x: 0, y: 0 };
        const k = n / v.s;
        const ax = e.clientX - r.left;
        const ay = e.clientY - r.top;
        return { s: n, x: ax - (ax - v.x) * k, y: ay - (ay - v.y) * k };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const down = (e: RPointerEvent) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    last.current = null;
  };
  const move = (e: RPointerEvent) => {
    const p = pts.current.get(e.pointerId);
    if (!p) return;
    const was = { ...p };
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = box.current!.getBoundingClientRect();
    if (pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (last.current && last.current.d > 0) to(view.s * (d / last.current.d), (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      last.current = { d, x: 0, y: 0 };
    } else if (view.s > MIN) {
      setView((v) => ({ ...v, x: v.x + (e.clientX - was.x), y: v.y + (e.clientY - was.y) }));
    }
  };
  const up = (e: RPointerEvent) => {
    pts.current.delete(e.pointerId);
    last.current = null;
  };
  const [l, t, r, b] = outline?.length === 4 ? outline.map(Number) : [0, 0, 0, 0];
  const centre = () => {
    const r = box.current?.getBoundingClientRect();
    return { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
  };
  // the page as it stands after the turn: width over height, and the photograph inside it sized so that, turned, it fills it exactly
  const deg = turn ?? 0;
  const side = deg % 180 !== 0;
  const w = size?.w ?? 1;
  const h = size?.h ?? 1.414;
  const ratio = side ? h / w : w / h;
  return (
    <div className="b-zoomwrap">
      <div className="b-zoombar" role="group" aria-label="Zoom the picture">
        <button type="button" className="btn secondary" aria-label="Zoom out" onClick={() => to(view.s / 1.4, centre().x, centre().y)} data-zoom-out="">−</button>
        <button type="button" className="btn secondary" aria-label="Zoom in" onClick={() => to(view.s * 1.4, centre().x, centre().y)} data-zoom-in="">+</button>
        <button type="button" className="btn secondary" aria-label="Fit the picture" onClick={() => setView({ s: 1, x: 0, y: 0 })} data-zoom-fit="">Fit</button>
        <button type="button" className="btn secondary" aria-label="Turn the page a quarter" onClick={() => { setTurn((x) => ((x ?? 0) + 90) % 360); setView({ s: 1, x: 0, y: 0 }); }} data-rotate="">Rotate ↻</button>
        <a href={src} target="_blank" rel="noreferrer" className="btn secondary" data-page-open="">Open full size</a>
        <span className="b-muted" aria-live="polite">{Math.round(view.s * 100)}%</span>
      </div>
      <Card flush ref={box} className="b-zoom" data-zoom={view.s.toFixed(2)} data-turn={deg} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="b-zoomin" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
          <div className="relative mx-auto" style={{ aspectRatio: `${ratio}`, width: `min(100%, calc(70vh * ${ratio}))` }}>
            <div
              className="absolute left-1/2 top-1/2"
              style={{ width: `${(side ? w / h : 1) * 100}%`, height: `${(side ? h / w : 1) * 100}%`, transform: `translate(-50%, -50%) rotate(${deg}deg)` }}
            >
              <img
                src={src}
                alt={alt}
                draggable={false}
                className="h-full w-full"
                onLoad={(e) => {
                  const im = e.currentTarget;
                  setSize({ w: im.naturalWidth, h: im.naturalHeight });
                  // a page is taller than wide: a wider photograph was taken sideways, its top at the right
                  setTurn((x) => x ?? (im.naturalWidth > im.naturalHeight ? 270 : 0));
                }}
              />
              {r > l && b > t ? <span data-testid="crop-outline" className="b-box" style={{ left: `${l * 100}%`, top: `${t * 100}%`, width: `${(r - l) * 100}%`, height: `${(b - t) * 100}%` }} /> : null}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function PaperChecker({ items, paper, focus, lost, nowrite, side, panel, panelFor }: {
  items: Q[]; paper: string; focus?: string; lost?: string; nowrite?: boolean;
  /** what stands beside the page: whose paper, the way to the child's other papers, the scan */
  side?: React.ReactNode;
  /** the tools for one answer (its right answer, its mistake, whose page), opened in the table under that answer's row */
  panel?: React.ReactNode; panelFor?: string;
}) {
  const router = useRouter();
  // what a press has just saved, shown at once; whatever the server says afterwards replaces it
  const served = items.map((q) => `${q.id}:${q.mark}`).join("|");
  const [kept, setKept] = useState<{ served: string; marks: Record<string, Mark> }>({ served, marks: {} });
  const marks = useMemo(() => ({ ...Object.fromEntries(items.map((q) => [q.id, q.mark])), ...(kept.served === served ? kept.marks : {}) }) as Record<string, Mark>, [items, kept, served]);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();
  const saving = useRef(false);
  const pages = useMemo(() => [...new Set(items.map((q) => `${q.capture}/${q.page}`))], [items]);
  const first = items.find((q) => q.id === focus) ?? items.find((q) => q.mark === "judge") ?? items[0];
  const [shown, setShown] = useState<string | undefined>(first?.id);
  const [pageAt, setPageAt] = useState(first ? `${first.capture}/${first.page}` : "");
  const mark = (q: Q) => marks[q.id] ?? q.mark;
  const count = (m: Mark) => items.filter((q) => mark(q) === m).length;
  const needed = items.filter((q) => q.canJudge || q.touched);
  const judged = needed.filter((q) => mark(q) !== "judge").length;

  const settle = (q: Q, run: () => Promise<{ ok: true; mark: Mark } | { ok: false; error: string }>) => {
    if (saving.current || nowrite) return;
    saving.current = true;
    setErrors((e) => ({ ...e, [q.id]: "" }));
    start(async () => {
      try {
        const r = await run();
        if (r.ok) {
          setKept((x) => ({ served, marks: { ...(x.served === served ? x.marks : {}), [q.id]: r.mark } }));
          if (r.mark === "judge") setErrors((e) => ({ ...e, [q.id]: "The engine could not mark those words: press Right, Wrong, Wrong with working or Blank." }));
          // nothing left to judge: the page's sign-off appears
          else if (!items.some((o) => o.id !== q.id && (marks[o.id] ?? o.mark) === "judge")) router.refresh();
        } else setErrors((e) => ({ ...e, [q.id]: r.error }));
      } catch {
        setErrors((e) => ({ ...e, [q.id]: "Nothing was saved. Try again." }));
      } finally {
        saving.current = false;
      }
    });
  };
  const press = (q: Q, m: Said) => settle(q, () => markAnswer({ result: q.id, paper, mark: m }));
  const tell = (q: Q) => {
    const wrote = (typed[q.id] ?? q.read ?? "").trim();
    if (!wrote) return setErrors((e) => ({ ...e, [q.id]: "Type what the child wrote, or press Blank." }));
    settle(q, () => tellWritten({ result: q.id, paper, wrote }));
  };
  const show = (q: Q) => { setShown(q.id); setPageAt(`${q.capture}/${q.page}`); };

  const columns: Column<Q>[] = [
    { key: "q", label: "Q", num: true, width: "3rem", value: (q) => q.label, cell: (q) => <button type="button" className="underline" onClick={() => show(q)} title="Show its page" data-show-page="">{q.label}</button> },
    { key: "question", label: "Question", value: (q) => q.question },
    { key: "answer", label: "Right answer", num: true, width: "6rem", value: (q) => q.answer },
    { key: "read", label: "System read", num: true, width: "6rem", keep: true, value: (q) => q.read, cell: (q) => <span data-system-read="">{q.read || <span className="b-muted">nothing</span>}</span> },
    {
      key: "check",
      label: "Your check",
      width: "19rem",
      keep: true,
      value: (q) => mark(q),
      cell: (q) => {
        const m = mark(q);
        if (!(q.canJudge && m === "judge" && !nowrite))
          return (
            <span className="flex flex-wrap items-center gap-2">
              <StatusChip state={CHIP[m].state} words={CHIP[m].words} round />
              <a href={q.id === panelFor ? q.close : q.href} className="underline b-muted" data-change="" aria-expanded={q.id === panelFor}>{q.id === panelFor ? "Close" : m === "judge" ? "More" : "Change"}</a>
            </span>
          );
        return (
          <div className="grid gap-2" role="group" aria-label={`Check question ${q.label}`}>
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); tell(q); }}>
              <input className="input w-20" aria-label={`What the child wrote for question ${q.label}`} inputMode="numeric" maxLength={40} defaultValue={q.read ?? ""} onFocus={() => show(q)} onChange={(e) => setTyped((t) => ({ ...t, [q.id]: e.target.value }))} data-wrote="" />
              <button type="submit" className="btn" disabled={busy} data-tell="" title="The child wrote this number: the system marks it">Child wrote this</button>
            </form>
            <div className="flex flex-wrap gap-1">
              {BUTTONS.map((b) => (
                <button key={b.mark} type="button" className="btn secondary" data-mark-btn={b.mark} disabled={busy} onClick={() => press(q, b.mark)}>{b.words}</button>
              ))}
            </div>
            {errors[q.id] ? <p role="alert" className="text-terracotta" data-mark-error="">{errors[q.id]}</p> : null}
            <a href={q.id === panelFor ? q.close : q.href} className="underline b-muted" data-change="">{q.id === panelFor ? "Close" : "More: the right answer, the mistake, whose page"}</a>
          </div>
        );
      },
    },
  ];
  const label = `${items.length} answers: ${count("right")} right, ${count("wrong")} wrong, ${count("working")} wrong with working, ${count("blank")} blank, ${count("judge")} for you to judge`;
  const cur = items.find((q) => q.id === shown);
  const outline = cur && cur.outlined && pageAt === `${cur.capture}/${cur.page}` ? cur.box : null;
  const whole = `/api/scan/${pageAt}`;
  const lostHere = lost && first && pageAt === `${first.capture}/${first.page}`;
  return (
    <section className="grid gap-[var(--space-3)]" aria-label="Check this paper" data-block="PaperChecker">
      <div className="grid gap-[var(--space-4)] lg:grid-cols-[minmax(0,1fr)_minmax(320px,36%)] lg:items-start">
        <div className="grid min-w-0 gap-[var(--space-3)]" data-part="evaluate">
          <div className="b-keyrow" aria-label={label} data-counts="">
            {(["right", "wrong", "working", "blank", "judge"] as const).map((m) => (
              <span key={m} data-count={m}><StatusChip state={CHIP[m].state} words={`${count(m)} ${CHIP[m].words.toLowerCase()}`} round /></span>
            ))}
          </div>
          {needed.length ? (
            <p className="flex flex-wrap items-center gap-2" data-progress="">
              <progress max={needed.length} value={judged} aria-label="Answers judged" />
              <span>{judged} of {needed.length} judged</span>
            </p>
          ) : null}
          <DataTable
            label="Every question on this paper"
            columns={columns}
            rows={items}
            rowKey={(q) => q.id}
            dense
            // one table per page of the paper, every question shown: a paper is checked whole, never a page of its rows
            more={{ by: (q) => (pages.length > 1 ? `Page ${pages.indexOf(`${q.capture}/${q.page}`) + 1}` : "This paper") }}
            limit={Math.max(TABLE_ROW_LIMIT, items.length)}
            extras={{
              attrs: (q) => ({ "data-q": q.id, "data-mark": mark(q), id: `a-${q.id}`, ...(q.id === shown ? { "aria-current": "true" } : {}) }),
              expand: (q) => (q.id === panelFor ? panel : undefined),
            }}
          />
        </div>
        <aside className="grid gap-[var(--space-2)] lg:sticky lg:top-2 lg:max-h-[calc(100vh-1rem)] lg:overflow-y-auto" data-view="paper" aria-label="The child's paper">
          {side}
          {pages.length > 1 ? (
            <p className="flex flex-wrap items-center gap-2" role="group" aria-label="Pages of this paper">
              {pages.map((p, i) => (
                <button key={p} type="button" className="btn secondary" aria-pressed={p === pageAt} onClick={() => setPageAt(p)}>Page {i + 1}</button>
              ))}
            </p>
          ) : null}
          {lostHere ? (
            <Card as="figure" data-page-not-found={first?.page ?? 1} className="b-card">
              <p>{lost}</p>
              <figcaption className="b-muted">Its answers wait for you. Scan the page again and send it to be read.</figcaption>
            </Card>
          ) : (
            <figure data-block="PageImage" className="b-pagefig">
              <Zoom key={whole} src={whole} alt="The child's page as uploaded" outline={outline} />
              <figcaption className="b-muted">The child&rsquo;s page as uploaded{cur && outline ? `; question ${cur.label} is outlined` : ""}. Click a question&rsquo;s number to find it here.</figcaption>
            </figure>
          )}
        </aside>
      </div>
    </section>
  );
}
