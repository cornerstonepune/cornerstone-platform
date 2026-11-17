"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Card } from "@/components/cards";
import { ICON_SIZE, Icon } from "@/lib/icons";
import type { Pattern, PatternCell } from "@/lib/timetable-build";
import type { Head } from "@/lib/timetable-palette";
import { changePattern, copyWeek, fillPeriod, type Edit, type Outcome } from "./actions";

// The builder (CP-71, wireframe 2): pick a subject, then click or press Space on a cell to paint it; "Fill this period every day"; "Copy
// week A to week B"; Undo and Redo, which apply the inverse the engine returned. The engine checks every change and refuses in words; a
// change made on an older pattern than the engine holds is refused too, and the page then reads the pattern again. Building is a
// desktop job: below 700 px (and for anyone who may not write) the read-only grid the page drew is shown instead, with no controls.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WIDE = "(min-width: 701px)";
type Pick = string | "clear" | null;

export function Builder({ initial, palette, canWrite, from, readOnly }: { initial: Pattern; palette: Head[]; canWrite: boolean; from?: string; readOnly: ReactNode }) {
  const router = useRouter();
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const set = () => setWide(m.matches);
    set();
    m.addEventListener("change", set);
    return () => m.removeEventListener("change", set);
  }, []);
  const [pattern, setPattern] = useState(initial);
  const [week, setWeek] = useState<"A" | "B">("A");
  const [pick, setPick] = useState<Pick>(null);
  const [undo, setUndo] = useState<Edit[][]>([]);
  const [redo, setRedo] = useState<Edit[][]>([]);
  const [said, setSaid] = useState<{ words: string; stale?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const letters = useRef({ key: "", at: -1 });

  if (!canWrite || !wide) return <>{readOnly}</>;

  const at = new Map<string, PatternCell>(pattern.cells.filter((c) => c.week === week).map((c) => [`${c.period_id}:${c.weekday}`, c]));
  const head = (code: string | null) => palette.find((h) => h.code === code);
  const chosen = pick && pick !== "clear" ? head(pick) : undefined;

  const settle = async (run: Promise<Outcome>, ok: (o: Extract<Outcome, { ok: true }>) => void, words: string) => {
    setBusy(true);
    const o = await run;
    setBusy(false);
    if (!o.ok) {
      setSaid({ words: o.why, stale: /changed since you opened/.test(o.why) });
      return;
    }
    setPattern(o.pattern);
    ok(o);
    setSaid({ words: o.skipped ? `${words} ${o.skipped} fixed ${o.skipped === 1 ? "cell was" : "cells were"} left alone.` : words });
  };

  const paint = (periodId: string, weekday: number) => {
    if (busy || !pick) return;
    const edit: Edit = chosen
      ? { period_id: periodId, week, weekday, op: "set", cell: chosen.cell, subject_code: chosen.code, text: chosen.label }
      : { period_id: periodId, week, weekday, op: "clear" };
    void settle(changePattern(pattern.class.id, pattern.version, [edit], from), (o) => { setUndo((u) => [...u, o.inverse]); setRedo([]); }, chosen ? `${chosen.label} placed.` : "Cleared.");
  };
  const fill = (periodId: string) => {
    if (busy || !chosen) return;
    void settle(fillPeriod(pattern.class.id, pattern.version, periodId, { cell: chosen.cell, subject_code: chosen.code, text: chosen.label }, from), (o) => { setUndo((u) => [...u, o.inverse]); setRedo([]); }, `${chosen.label} placed in this period every day.`);
  };
  const copy = () => {
    if (busy) return;
    void settle(copyWeek(pattern.class.id, pattern.version, from), (o) => { setUndo((u) => [...u, o.inverse]); setRedo([]); }, "Week B now matches week A.");
  };
  const step = (from_: Edit[][], to: (f: (e: Edit[][]) => Edit[][]) => void, back: (f: (e: Edit[][]) => Edit[][]) => void, words: string) => {
    const last = from_[from_.length - 1];
    if (busy || !last) return;
    void settle(changePattern(pattern.class.id, pattern.version, last, from), (o) => { back((e) => e.slice(0, -1)); to((e) => [...e, o.inverse]); }, words);
  };
  const doUndo = () => step(undo, setRedo, setUndo, "Undone.");
  const doRedo = () => step(redo, setUndo, setRedo, "Done again.");

  const move = (e: KeyboardEvent<HTMLElement>) => {
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "y")) { e.preventDefault(); return k === "z" ? doUndo() : doRedo(); }
    const cells = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>("[data-cell]") ?? []);
    const here = cells.indexOf(document.activeElement as HTMLButtonElement);
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 }[k as "ArrowRight"];
    if (d !== undefined && here >= 0) { e.preventDefault(); cells[Math.max(0, Math.min(cells.length - 1, here + d))]?.focus(); return; }
    if (k === "Delete" || k === "Backspace") { const el = document.activeElement as HTMLElement; if (el?.dataset.cell && el.dataset.period) { e.preventDefault(); if (!busy) void settle(changePattern(pattern.class.id, pattern.version, [{ period_id: el.dataset.period, week, weekday: Number(el.dataset.day), op: "clear" }], from), (o) => { setUndo((u) => [...u, o.inverse]); setRedo([]); }, "Cleared."); } return; }
    if (k.length === 1 && /[a-z]/i.test(k) && !e.ctrlKey && !e.metaKey) {
      const same = palette.filter((h) => h.label.toLowerCase().startsWith(k.toLowerCase()));
      if (!same.length) return;
      const next = letters.current.key === k.toLowerCase() ? (letters.current.at + 1) % same.length : 0;
      letters.current = { key: k.toLowerCase(), at: next };
      setPick(same[next].code);
    }
  };

  return (
    <section className="bd-pattern" data-pattern-class={pattern.class.id} data-version={pattern.version} onKeyDown={move}>
      <div className="bd-bar">
        <nav className="bd-week" aria-label="Week">
          {(["A", "B"] as const).map((w) => (
            <button key={w} type="button" className={w === week ? "chip on" : "chip"} aria-pressed={w === week} onClick={() => setWeek(w)}>Week {w}</button>
          ))}
        </nav>
        <div className="bd-tools">
          <button type="button" className="chip" onClick={doUndo} disabled={!undo.length || busy} data-undo>Undo</button>
          <button type="button" className="chip" onClick={doRedo} disabled={!redo.length || busy} data-redo>Redo</button>
          <button type="button" className="chip" onClick={copy} disabled={busy} data-copy-week>Copy week A to week B</button>
        </div>
      </div>
      <div className="bd-palette" role="toolbar" aria-label="Paint with" data-paint>
        {palette.map((h) => (
          <button key={h.code} type="button" className={`chip${pick === h.code ? " on" : ""}`} aria-pressed={pick === h.code} data-subject={h.look} onClick={() => setPick(pick === h.code ? null : h.code)} data-paint-subject={h.code}>
            {h.label}
          </button>
        ))}
        <button type="button" className={`chip${pick === "clear" ? " on" : ""}`} aria-pressed={pick === "clear"} onClick={() => setPick(pick === "clear" ? null : "clear")} data-paint-clear>Clear</button>
      </div>
      <p role="status" className="b-muted" data-said>
        {said ? said.words : pick ? "Click a cell to paint it." : "Pick a subject, then click the cells."}
        {said?.stale ? <> <button type="button" className="chip" onClick={() => router.refresh()}>Look again</button></> : null}
      </p>
      <div className="b-fgrid-box"><div className="b-fweek" ref={grid}>
        <div className="b-fgrid" style={{ "--cols": 5 } as React.CSSProperties}>
          <span />
          {DAYS.map((d) => <span key={d} className="b-dh"><span className="b-dh-wd">{d}</span></span>)}
          {pattern.periods.map((p) => {
            const first = at.get(`${p.id}:1`);
            if (p.fixed)
              return (
                <Card key={p.id} compact tone="quiet" className="b-band">
                  <span className="b-band-tm">{p.starts_at}</span>
                  <span className="b-band-body"><Icon name="break" size={ICON_SIZE.table} />{first?.text || p.label}</span>
                </Card>
              );
            return [
              <span key={`${p.id}t`} className="b-tm">
                <span className="b-tm-start">{p.starts_at}–{p.ends_at ?? ""}</span> <span className="b-tm-end">{p.label}</span>
                <button type="button" className="chip" disabled={!chosen || busy} onClick={() => fill(p.id)} data-fill={p.id} aria-label={`Fill ${p.label} every day`}>Fill every day</button>
              </span>,
              ...[1, 2, 3, 4, 5].map((d) => {
                const c = at.get(`${p.id}:${d}`);
                const h = c && c.cell !== "empty" ? head(c.subject_code) : undefined;
                const fixed = c?.cell === "fixed";
                return (
                  <Card key={`${p.id}-${d}`} as="button" type="button" compact tone="quiet" className="b-cell" data-cell data-period={p.id} data-day={d} data-subject={h?.look} data-empty={!c || c.cell === "empty" ? "" : undefined}
                    aria-label={`${DAYS[d - 1]} ${p.label}: ${c && c.cell !== "empty" ? c.text : "free"}`} aria-disabled={fixed} disabled={fixed} onClick={() => paint(p.id, d)}>
                    {c && c.cell !== "empty" ? (
                      <>
                        <span className="b-subj">{h ? <Icon name={h.look} size={ICON_SIZE.table} /> : null}{c.text}</span>
                      </>
                    ) : <span className="b-muted">Free</span>}
                  </Card>
                );
              }),
            ];
          })}
        </div>
        </div>
      </div>
    </section>
  );
}
