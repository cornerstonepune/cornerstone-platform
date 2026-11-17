"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent as RPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/cards";
import { StatusChip, type State } from "@/components/status-chip";
import { markAnswer, type Mark as Said } from "./mark-action";

// Checking a paper in one flow (CP-62): the page as photographed is the main thing, with zoom; a strip of numbered questions coloured by where each
// stands; choosing one shows only that question's snapshot with four large buttons (right, wrong, wrong with working, blank: the three signals stay
// three) and the way on. Keys: 1 to 4 mark, ← and → move. A mark saves at once and the counts here follow it.
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
};
const CHIP: Record<Mark, { state: State; words: string }> = {
  right: { state: "right", words: "Right" },
  wrong: { state: "wrong", words: "Wrong" },
  working: { state: "wrong", words: "Wrong, with working" },
  blank: { state: "blank", words: "Blank" },
  judge: { state: "judge", words: "For you to judge" },
};
const GLYPH: Record<Mark, string> = { right: "✓", wrong: "✗", working: "✎", blank: "–", judge: "!" };
const BUTTONS: { key: "1" | "2" | "3" | "4"; mark: Said; words: string }[] = [
  { key: "1", mark: "right", words: "Right" },
  { key: "2", mark: "wrong", words: "Wrong" },
  { key: "3", mark: "working", words: "Wrong with working" },
  { key: "4", mark: "blank", words: "Blank" },
];
const MIN = 1;
const MAX = 6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A picture to look at closely: zoom buttons, the wheel, a pinch, and a drag to move about it. */
function Zoom({ src, alt, outline }: { src: string; alt: string; outline?: number[] | null }) {
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef<{ d: number; x: number; y: number } | null>(null);
  const moved = useRef(false);
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
    moved.current = false;
  };
  const move = (e: RPointerEvent) => {
    const p = pts.current.get(e.pointerId);
    if (!p) return;
    const was = { ...p };
    if (Math.hypot(e.clientX - was.x, e.clientY - was.y) > 0) moved.current = true;
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
  return (
    <div className="b-zoomwrap">
      <div className="b-zoombar" role="group" aria-label="Zoom the picture">
        <button type="button" className="btn secondary" aria-label="Zoom out" onClick={() => to(view.s / 1.4, centre().x, centre().y)} data-zoom-out="">−</button>
        <button type="button" className="btn secondary" aria-label="Zoom in" onClick={() => to(view.s * 1.4, centre().x, centre().y)} data-zoom-in="">+</button>
        <button type="button" className="btn secondary" aria-label="Fit the picture" onClick={() => setView({ s: 1, x: 0, y: 0 })} data-zoom-fit="">Fit</button>
        <span className="b-muted" aria-live="polite">{Math.round(view.s * 100)}%</span>
      </div>
      <Card flush ref={box} className="b-zoom" data-zoom={view.s.toFixed(2)} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="b-zoomin" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
          {/* the picture is a link to the page at its own size; a drag to move about it is not a click on it */}
          <a href={src} target="_blank" rel="noreferrer" aria-label="Open the page at full size" data-page-full="" onClick={(e) => { if (moved.current || view.s > MIN) e.preventDefault(); }}>
            <img src={src} alt={alt} draggable={false} />
          </a>
          {r > l && b > t ? <span data-testid="crop-outline" className="b-box" style={{ left: `${l * 100}%`, top: `${t * 100}%`, width: `${(r - l) * 100}%`, height: `${(b - t) * 100}%` }} /> : null}
        </div>
      </Card>
    </div>
  );
}

export function PaperChecker({ items, paper, focus, lost, nowrite }: { items: Q[]; paper: string; focus?: string; lost?: string; nowrite?: boolean }) {
  const router = useRouter();
  // what a press has just saved, shown at once; whatever the server says afterwards (a refresh, another tool on the page) replaces it
  const served = items.map((q) => `${q.id}:${q.mark}`).join("|");
  const [kept, setKept] = useState<{ served: string; marks: Record<string, Mark> }>({ served, marks: {} });
  const marks = useMemo(() => ({ ...Object.fromEntries(items.map((q) => [q.id, q.mark])), ...(kept.served === served ? kept.marks : {}) }) as Record<string, Mark>, [items, kept, served]);
  const [current, setCurrent] = useState<string | null>(null);
  const [pageAt, setPageAt] = useState(() => {
    const f = items.find((q) => q.id === focus) ?? items[0];
    return f ? `${f.capture}/${f.page}` : "";
  });
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const saving = useRef(false);
  const mark = (q: Q) => marks[q.id] ?? q.mark;
  const count = (m: Mark) => items.filter((q) => mark(q) === m).length;
  const pages = useMemo(() => [...new Set(items.map((q) => `${q.capture}/${q.page}`))], [items]);
  // the questions that needed a person: still with them, or already settled by one: "6 of 10 judged"
  const needed = items.filter((q) => q.canJudge || q.touched);
  const judged = needed.filter((q) => mark(q) !== "judge").length;
  const at = items.findIndex((q) => q.id === current);
  const cur = at >= 0 ? items[at] : null;
  const go = useCallback((to: number) => { setError(""); setCurrent(items[clamp(to, 0, items.length - 1)]?.id ?? null); }, [items]);
  const nextJudge = (from: number) => {
    const order = [...items.slice(from + 1), ...items.slice(0, from + 1)];
    return order.find((q) => marks[q.id] === "judge" && q.canJudge);
  };

  const save = useCallback((q: Q, m: Said) => {
    if (saving.current || nowrite) return;
    saving.current = true;
    setError("");
    start(async () => {
      try {
        const r = await markAnswer({ result: q.id, paper, mark: m });
        if (r.ok) {
          setKept((x) => ({ served, marks: { ...(x.served === served ? x.marks : {}), [q.id]: r.mark } }));
          // nothing left to judge: the page's sign-off appears
          if (!items.some((o) => o.id !== q.id && (marks[o.id] ?? o.mark) === "judge")) router.refresh();
        } else setError(r.error);
      } catch {
        setError("Nothing was saved. Press it again.");
      } finally {
        saving.current = false;
      }
    });
  }, [items, marks, nowrite, paper, router, served]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(at < 0 ? 0 : at + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(at < 0 ? 0 : at - 1); }
      else if (cur && "1234".includes(e.key) && e.key.length === 1) {
        const b = BUTTONS.find((x) => x.key === e.key)!;
        if (cur.canJudge && mark(cur) === "judge") { e.preventDefault(); save(cur, b.mark); }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const label = `${items.length} answers: ${count("right")} right, ${count("wrong")} wrong, ${count("working")} wrong with working, ${count("blank")} blank, ${count("judge")} for you to judge`;
  const snap = cur && cur.outlined && cur.box?.length === 4 ? `/api/scan/${cur.capture}/${cur.page}?box=${cur.box.join(",")}` : cur ? `/api/scan/${cur.capture}/${cur.page}` : "";
  const focusQ = items.find((q) => q.id === focus);
  const whole = `/api/scan/${pageAt}`;
  const n = nextJudge(at < 0 ? -1 : at);
  const onFocusPage = !!focusQ && pageAt === `${focusQ.capture}/${focusQ.page}`;
  const caption = !focusQ || !onFocusPage ? "The child's page as photographed" : focusQ.outlined ? `The child's page as photographed. Question ${focusQ.label} is outlined.` : `We could not find question ${focusQ.label} on this page: it is somewhere on this page.`;
  return (
    <section className="grid gap-[var(--space-3)]" aria-label="Check this paper" data-block="PaperChecker">
      <div className="b-keyrow" aria-label={label} data-counts="">
        {(["right", "wrong", "working", "blank", "judge"] as const).map((m) => (
          <span key={m} data-count={m}><StatusChip state={CHIP[m].state} words={`${count(m)} ${CHIP[m].words.toLowerCase()}`} round /></span>
        ))}
      </div>
      {needed.length ? (
        <p className="flex flex-wrap items-center gap-2" data-progress="">
          <progress max={needed.length} value={judged} aria-label="Answers judged" />
          <span>{judged} of {needed.length} judged</span>
          {n ? <button type="button" className="btn" onClick={() => go(items.indexOf(n))} data-next-to-judge="">Next to judge</button> : null}
        </p>
      ) : null}
      <ol className="b-qstrip" aria-label="Questions">
        {items.map((q, i) => (
          <li key={q.id}>
            <button type="button" className="b-q" data-q={q.id} data-mark={mark(q)} aria-pressed={q.id === current} aria-label={`Question ${q.label}: ${CHIP[mark(q)].words}`} title={`${q.label}. ${q.question}`} onClick={() => go(i)}>
              <span>{q.label}</span><span aria-hidden="true" className="b-q-g">{GLYPH[mark(q)]}</span>
            </button>
          </li>
        ))}
      </ol>
      {cur ? (
        <div className="grid gap-[var(--space-2)]" data-view="question">
          <h3 className="b-card-h" data-q-title="">Question {cur.label}: {cur.question}</h3>
          {cur.outlined ? null : <p className="b-caption">We could not find this question on its page: here is the whole page.</p>}
          <Zoom key={snap} src={snap} alt={`Question ${cur.label} as the child wrote it`} />
          <p><StatusChip state={CHIP[mark(cur)].state} words={CHIP[mark(cur)].words} round /></p>
          {cur.canJudge && mark(cur) === "judge" ? (
            <div className="b-marks" role="group" aria-label={`Mark question ${cur.label}`}>
              {BUTTONS.map((b) => (
                <button key={b.mark} type="button" className="btn b-markbtn" data-mark-btn={b.mark} disabled={busy} onClick={() => save(cur, b.mark)}>
                  <span className="b-kbd" aria-hidden="true">{b.key}</span> {b.words}
                </button>
              ))}
            </div>
          ) : (
            <p className="b-caption">{mark(cur) === "judge" ? "This one needs what the child wrote said first: use the question's tools below." : "Marked. To change it, use the question's tools below."}</p>
          )}
          {error ? <p role="alert" className="text-terracotta" data-mark-error="">{error}</p> : null}
          <p className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn secondary" disabled={at <= 0} onClick={() => go(at - 1)} data-prev-q="">← Before</button>
            <button type="button" className="btn secondary" disabled={at >= items.length - 1} onClick={() => go(at + 1)} data-next-q="">Next →</button>
            {n ? <button type="button" className="btn secondary" onClick={() => go(items.indexOf(n))}>Next to judge</button> : null}
            <button type="button" className="btn secondary" onClick={() => setCurrent(null)} data-whole-paper="">The whole paper</button>
          </p>
        </div>
      ) : (
        <div className="grid gap-[var(--space-2)]" data-view="paper">
          {pages.length > 1 ? (
            <p className="flex flex-wrap gap-2" role="group" aria-label="Pages of this paper">
              {pages.map((p, i) => (
                <button key={p} type="button" className="btn secondary" aria-pressed={p === pageAt} onClick={() => setPageAt(p)}>Page {i + 1}</button>
              ))}
            </p>
          ) : null}
          {lost && pageAt === `${focusQ?.capture}/${focusQ?.page}` ? (
            <Card as="figure" data-page-not-found={focusQ?.page ?? 1} className="b-card">
              <p>{lost}</p>
              <figcaption className="b-muted">Its answers wait for you. Scan the page again and send it to be read.</figcaption>
            </Card>
          ) : (
            <figure data-block="PageImage" className="b-pagefig">
              <Zoom key={whole} src={whole} alt="The child's page as photographed" outline={focusQ && pageAt === `${focusQ.capture}/${focusQ.page}` && focusQ.outlined ? focusQ.box : null} />
              <figcaption className="b-muted">{caption.endsWith(".") ? caption : `${caption}.`} Choose a question above to see just that answer.</figcaption>
            </figure>
          )}
        </div>
      )}
    </section>
  );
}
