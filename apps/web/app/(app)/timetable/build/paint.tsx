"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ICON_SIZE, Icon } from "@/lib/icons";
import type { Asked, Pattern } from "@/lib/timetable-build";
import { open as openOf, problemsOf, type Check, type Fix, type Problem } from "@/lib/timetable-check";
import type { Head } from "@/lib/timetable-palette";
import type { Rules } from "@/lib/timetable-rules";
import { pickerAt } from "../picker-actions";
import { allowProblem, changePattern, checkPattern, copyWeek, fillPeriod, saveRule, type Edit, type Outcome, type RuleBody } from "./actions";
import { PatternGrid } from "./cells";
import { CheckList } from "./check-list";
import { BuildPanel } from "./panel";
import { PlaceLesson, type Opened } from "./place-lesson";
import { Publish } from "./publish";
import { RulesList, type Placed } from "./rules-list";
import { undoOf } from "./undo";

// The builder (CP-71, wireframe 2): pick a subject, then click or press Space on a cell to paint it; "Fill this period every day"; "Copy
// week A to week B"; the panel's Check and Rules beside the grid. Every change of a cell or a rule goes on one history, so Undo and Redo
// step through both. With no subject picked, a click on a lesson opens what it teaches in the panel beside the grid (CP-74). The engine checks every change and refuses in words; a change made on an older pattern than the engine holds is
// refused too, and the page then reads the pattern again. After each change the whole school's patterns are checked again.
// Building is a desktop job: below 700 px (and for anyone who may not write) the read-only grid the page drew is shown instead.
const WIDE = "(min-width: 701px)";
const KEPT_STEPS = 20;
const DAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
type Pick = string | "clear" | null;
/** One thing done, as what puts it back: cells of a class (ours, or another's a fix moved), or a rule. */
export type Step = { kind: "cells"; classId: string; edits: Edit[] } | { kind: "rule"; body: RuleBody };
type Done = { ok: true; back: Step; skipped?: number } | { ok: false; why: string };

const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, select, textarea");

export function Builder({ initial, palette, rules: rules0, check: check0, canWrite, from, readOnly }: { initial: Pattern; palette: Head[]; rules: Rules | null; check: Asked<Check>; canWrite: boolean; from?: string; readOnly: ReactNode }) {
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
  const [rules, setRules] = useState(rules0);
  const [check, setCheck] = useState(check0);
  const [checking, setChecking] = useState(false);
  const [week, setWeek] = useState<"A" | "B">("A");
  const [pick, setPick] = useState<Pick>(null);
  const [undo, setUndo] = useState<Step[]>([]);
  const [redo, setRedo] = useState<Step[]>([]);
  const [said, setSaid] = useState<{ words: string; stale?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flag, setFlag] = useState<Problem | null>(null);
  const [place, setPlace] = useState<Opened | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const letters = useRef({ key: "", at: -1 });
  const asked = useRef(0);
  const me = pattern.class.id;

  const problems = useMemo(() => (check.ok ? problemsOf(check.data, me) : []), [check, me]);
  // where this class's lessons are in a problem, by place: the worst level wins, and the one being pointed at is ringed
  const marks = useMemo(() => {
    const at = new Map<string, "must" | "try">();
    for (const p of problems)
      if (!p.allowed)
        for (const x of p.places)
          if (x.class_id === me) {
            const k = `${x.week}:${x.period_id}:${x.weekday}`;
            if (p.level === "must" || !at.has(k)) at.set(k, p.level);
          }
    return at;
  }, [problems, me]);
  const flagged = useMemo(() => new Set((flag?.places ?? []).filter((x) => x.class_id === me).map((x) => `${x.week}:${x.period_id}:${x.weekday}`)), [flag, me]);
  const placed = useMemo(() => {
    const n: Placed = {};
    for (const c of pattern.cells) if (c.subject_code && (c.cell === "subject" || c.cell === "specialist")) (n[c.subject_code] ??= { A: 0, B: 0 })[c.week] += 1;
    return n;
  }, [pattern]);
  const looks = useMemo(() => Object.fromEntries(palette.map((h) => [h.code, h.look])), [palette]);

  if (!canWrite || !wide) return <>{readOnly}</>;

  const head = (code: string | null) => palette.find((h) => h.code === code);
  const chosen = pick && pick !== "clear" ? head(pick) : undefined;

  const recheck = async () => {
    const mine = ++asked.current;
    setChecking(true);
    const got = await checkPattern(from);
    if (mine !== asked.current) return; // a later change asked again: its answer is the one to show
    setChecking(false);
    setCheck(got);
  };

  /** One change of cells, made through the engine; what comes back is what would put it back. */
  const cells = async (run: Promise<Outcome>, classId: string): Promise<Done> => {
    const o = await run;
    if (!o.ok) return o;
    if (o.pattern.class.id === me) setPattern(o.pattern);
    return { ok: true, back: { kind: "cells", classId, edits: o.inverse }, skipped: o.skipped };
  };
  const rule = async (body: RuleBody): Promise<Done> => {
    const o = await saveRule(me, body);
    if (!o.ok || !rules) return o.ok ? { ok: false, why: "The rules could not be read." } : o;
    setRules(o.rules);
    return { ok: true, back: { kind: "rule", body: undoOf(rules, o.rules, body) } };
  };
  const play = (s: Step): Promise<Done> => (s.kind === "rule" ? rule(s.body) : cells(changePattern(s.classId, s.classId === me ? pattern.version : null, s.edits, from), s.classId));

  /** Run one thing, say what happened in the status line, keep its undo where `keep` puts it, and check again. */
  const settle = async (run: () => Promise<Done>, keep: (back: Step) => void, words: string) => {
    if (busy) return;
    setBusy(true);
    const o = await run();
    setBusy(false);
    if (!o.ok) {
      setSaid({ words: o.why, stale: /changed since you opened/.test(o.why) });
      return;
    }
    keep(o.back);
    setSaid({ words: o.skipped ? `${words} ${o.skipped} fixed ${o.skipped === 1 ? "cell was" : "cells were"} left alone.` : words });
    void recheck();
  };
  const fresh = (back: Step) => {
    setUndo((u) => [...u, back].slice(-KEPT_STEPS));
    setRedo([]);
  };
  const change = (edits: Edit[], words: string, classId = me) => settle(() => cells(changePattern(classId, classId === me ? pattern.version : null, edits, from), classId), fresh, words);

  /** A lesson of the grid opened: its place in words at once, then the dated lesson it stands for (or what is next, unpublished). */
  const openPlace = (periodId: string, weekday: number) => {
    const c = pattern.cells.find((x) => x.week === week && x.period_id === periodId && x.weekday === weekday);
    const p = pattern.periods.find((x) => x.id === periodId);
    if (!c || !p || (c.cell !== "subject" && c.cell !== "specialist")) return;
    const key = `${week}:${periodId}:${weekday}`;
    setPlace({ key, words: `${DAY[weekday]} ${p.label}, week ${week} · ${c.text}`, got: null });
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-place-title]")?.focus());
    void pickerAt({ classId: me, week, periodId, weekday, subject: c.subject_code }).then((got) => setPlace((now) => (now?.key === key ? { ...now, got } : now)));
  };
  const closePlace = () => {
    const key = place?.key.split(":");
    setPlace(null);
    if (key) requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-period="${key[1]}"][data-day="${key[2]}"]`)?.focus());
  };
  const paint = (periodId: string, weekday: number) => {
    if (!pick) return openPlace(periodId, weekday);
    const edit: Edit = chosen
      ? { period_id: periodId, week, weekday, op: "set", cell: chosen.cell, subject_code: chosen.code, text: chosen.label }
      : { period_id: periodId, week, weekday, op: "clear" };
    void change([edit], chosen ? `${chosen.label} placed.` : "Cleared.");
  };
  const fill = (periodId: string) => {
    if (!chosen) return;
    void settle(() => cells(fillPeriod(me, pattern.version, periodId, { cell: chosen.cell, subject_code: chosen.code, text: chosen.label }, from), me), fresh, `${chosen.label} placed in this period every day.`);
  };
  const copy = () => void settle(() => cells(copyWeek(me, pattern.version, from), me), fresh, "Week B now matches week A.");
  const doUndo = () => {
    const last = undo[undo.length - 1];
    if (last) void settle(() => play(last), (back) => { setUndo((u) => u.slice(0, -1)); setRedo((r) => [...r, back]); }, "Undone.");
  };
  const doRedo = () => {
    const last = redo[redo.length - 1];
    if (last) void settle(() => play(last), (back) => { setRedo((r) => r.slice(0, -1)); setUndo((u) => [...u, back]); }, "Done again.");
  };
  const fix = (p: Problem, f: Fix) => void change(f.edits, `${f.sentence} Undo puts it back.`, f.class_id);
  const allow = async (p: Problem, reason: string) => {
    if (busy) return;
    setBusy(true);
    const o = await allowProblem(p.allow_key, reason, from);
    setBusy(false);
    setSaid({ words: o.ok ? "Allowed this once, with your reason." : o.why });
    if (o.ok) void recheck();
  };
  /** Go to a problem's first lesson of this class: its week, and the cell takes the focus. */
  const show = (p: Problem) => {
    const x = p.places.find((y) => y.class_id === me);
    if (!x) return;
    setWeek(x.week);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-period="${x.period_id}"][data-day="${x.weekday}"]`)?.focus());
  };

  const move = (e: KeyboardEvent<HTMLElement>) => {
    if (typing(e.target)) return; // a key typed into a rule's field is the field's
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === "z" || k === "y")) { e.preventDefault(); return k === "z" ? doUndo() : doRedo(); }
    const all = Array.from(grid.current?.querySelectorAll<HTMLButtonElement>("[data-cell]") ?? []);
    const here = all.indexOf(document.activeElement as HTMLButtonElement);
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 }[k as "ArrowRight"];
    if (d !== undefined && here >= 0) { e.preventDefault(); all[Math.max(0, Math.min(all.length - 1, here + d))]?.focus(); return; }
    if (k === "Delete" || k === "Backspace") {
      const el = document.activeElement as HTMLElement;
      if (el?.dataset.cell !== undefined && el.dataset.period) { e.preventDefault(); void change([{ period_id: el.dataset.period, week, weekday: Number(el.dataset.day), op: "clear" }], "Cleared."); }
      return;
    }
    if (k.length === 1 && /[a-z]/i.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const same = palette.filter((h) => h.label.toLowerCase().startsWith(k.toLowerCase()));
      if (!same.length) return;
      const next = letters.current.key === k.toLowerCase() ? (letters.current.at + 1) % same.length : 0;
      letters.current = { key: k.toLowerCase(), at: next };
      setPick(same[next].code);
    }
  };

  return (
    <section className="bd-pattern" data-block="PatternBuilder" data-pattern-class={me} data-version={pattern.version} onKeyDown={move}>
      <div className="bd-bar">
        <nav className="bd-week" aria-label="Week">
          {(["A", "B"] as const).map((w) => (
            <button key={w} type="button" className={w === week ? "chip on" : "chip"} aria-pressed={w === week} onClick={() => setWeek(w)}>Week {w}</button>
          ))}
        </nav>
        <div className="bd-tools">
          <button type="button" className="chip" onClick={doUndo} disabled={!undo.length || busy} aria-keyshortcuts="Control+Z" data-undo>Undo</button>
          <button type="button" className="chip" onClick={doRedo} disabled={!redo.length || busy} aria-keyshortcuts="Control+Y" data-redo>Redo</button>
          <button type="button" className="chip" onClick={copy} disabled={busy} data-copy-week>Copy week A to week B</button>
          <Publish classId={me} next={pattern.next_fortnight} must={openOf(problems).must} busy={busy} onSaid={(words) => setSaid({ words })} onDone={() => router.refresh()} />
        </div>
      </div>
      <div className="bd-palette" role="toolbar" aria-label="Paint with" data-paint>
        {palette.map((h) => (
          <button key={h.code} type="button" className={`chip${pick === h.code ? " on" : ""}`} aria-pressed={pick === h.code} data-subject={h.look} onClick={() => setPick(pick === h.code ? null : h.code)} data-paint-subject={h.code}>
            <Icon name={h.look} size={ICON_SIZE.table} />{h.label}
          </button>
        ))}
        <button type="button" className={`chip${pick === "clear" ? " on" : ""}`} aria-pressed={pick === "clear"} onClick={() => setPick(pick === "clear" ? null : "clear")} data-paint-clear>Clear</button>
      </div>
      <p role="status" aria-live="polite" className="bd-status" data-said>
        {said ? said.words : pick ? "Click a cell to paint it." : "Pick a subject to paint, or click a lesson to choose what it teaches."}
        {said?.stale ? <> <button type="button" className="chip" onClick={() => router.refresh()}>Look again</button></> : null}
      </p>
      <div className="bd-work">
        <PatternGrid box={grid} pattern={pattern} week={week} palette={palette} marks={marks} flagged={flagged} opened={place?.key} canFill={!!chosen && !busy} onPaint={paint} onFill={fill} />
        <BuildPanel
          open={openOf(problems)}
          lesson={place ? <PlaceLesson opened={place} next={pattern.next_fortnight?.number ?? null} onClose={closePlace} /> : null}
          check={<CheckList problems={problems} notes={check.ok ? (check.data.notes_of[me] ?? []) : []} why={check.ok ? null : check.why} checking={checking} busy={busy} classId={me} onFix={fix} onAllow={allow} onFlag={setFlag} onShow={show} />}
          rules={rules ? <RulesList rules={rules} placed={placed} busy={busy} looks={looks} subjects={palette} send={(body, words) => void settle(() => rule(body), fresh, words)} /> : <p className="bd-check-why" role="alert">The rules could not be read. Reload the page to try again.</p>}
        />
      </div>
    </section>
  );
}
