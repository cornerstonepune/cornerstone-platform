"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { DataTable } from "@/components/data-table";
import type { Column } from "@/lib/ux-rules";
import { dateWords } from "@/lib/week";

// Go live (UI-6b): the coordinator puts every class's newest placed draft live for this fortnight; the engine answers what each one
// changed (`POST /timetable/go-live`, nothing stored), and every session it moved or removed is listed here, and nothing else. The
// answer is kept in this browser for the fortnight, so reloading the page does not lose it.
type Moved = { session: string; subject: string; from_date: string; to_date: string };
type Removed = { session: string; subject: string; date: string };
type Report = { added: number; moved: Moved[]; removed: Removed[]; discarded: boolean; lines_without_lesson: string[] };
type Row = { key: string; klass: string; what: "Moved" | "Removed"; subject: string; from: string; to: string };
type Done = { rows: Row[]; added: number; classes: number; refused: { class: string; error: string }[] };

const COLUMNS: Column<Row>[] = [
  { key: "class", label: "Class", width: "7rem", value: (r) => r.klass },
  { key: "what", label: "What", width: "7rem", value: (r) => r.what },
  { key: "subject", label: "Subject", value: (r) => r.subject },
  { key: "from", label: "From", width: "9rem", value: (r) => r.from },
  { key: "to", label: "To", width: "9rem", value: (r) => r.to },
];

// The answer is kept in this browser's session storage; it is read as an external store (never set inside an effect), so the server and the
// first client render both show none and the kept answer appears once the browser has it.
const listeners = new Set<() => void>();
const kept = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null; // no storage: the table shows only straight after Go live
  }
};
const keep = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
    listeners.forEach((l) => l());
  } catch {
    /* see above */
  }
};
const watch = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function GoLive({ number, subjects, can }: { number: number; subjects: Record<string, string>; can: boolean }) {
  const key = `golive-${number}`;
  const [fresh, setFresh] = useState<Done | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const stored = useSyncExternalStore(watch, () => kept(key), () => null);
  const done = useMemo(() => fresh ?? (stored ? (JSON.parse(stored) as Done) : null), [fresh, stored]);

  async function go(form: FormData) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/timetable/golive", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { reports?: { class: string; report: Report }[]; refused?: { class: string; error: string }[]; error?: string };
      if (!res.ok && !body.reports?.length) {
        setError(body.refused?.map((r) => `${r.class}: ${r.error}`).join(" ") || body.error || "That was not done.");
        return;
      }
      const name = (code: string) => subjects[code] ?? code;
      const rows: Row[] = (body.reports ?? []).flatMap(({ class: klass, report }) => [
        ...report.moved.map((m): Row => ({ key: m.session, klass, what: "Moved", subject: name(m.subject), from: dateWords(m.from_date), to: dateWords(m.to_date) })),
        ...report.removed.map((r): Row => ({ key: r.session, klass, what: "Removed", subject: name(r.subject), from: dateWords(r.date), to: "" })),
      ]);
      const result: Done = { rows, added: (body.reports ?? []).reduce((n, r) => n + r.report.added, 0), classes: body.reports?.length ?? 0, refused: body.refused ?? [] };
      setFresh(result);
      keep(key, JSON.stringify(result));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {can && !done ? (
        <form
          className="tt-card tt-row"
          aria-label="Go live"
          onSubmit={(e) => {
            e.preventDefault();
            void go(new FormData(e.currentTarget));
          }}
        >
          <input type="hidden" name="fortnight" value={number} />
          <label>
            Reason (needed once the fortnight is frozen)
            <input name="reason" />
          </label>
          <button className="btn" data-ux="action" disabled={busy}>
            Go live
          </button>
        </form>
      ) : null}
      {error ? <p role="alert" className="tt-error">{error}</p> : null}
      {done ? (
        <section className="tt-card" aria-labelledby="h-changed" data-card="what-changed">
          <h2 id="h-changed">What changed</h2>
          <p data-went-live>
            Fortnight {number} went live for {done.classes} class{done.classes === 1 ? "" : "es"}: {done.rows.filter((r) => r.what === "Moved").length} sessions moved, {done.rows.filter((r) => r.what === "Removed").length} lessons removed, {done.added} added.
          </p>
          {done.refused.map((r) => (
            <p key={r.class} role="alert" className="tt-error">{r.class}: {r.error}</p>
          ))}
          {done.rows.length ? (
            <DataTable label="What changed" columns={COLUMNS} rows={done.rows} rowKey={(r) => r.key} limit={done.rows.length} more={{ by: (r) => r.klass }} extras={{ attrs: (r) => ({ "data-session": r.key }) }} />
          ) : (
            <p className="tt-empty">Nothing moved: the sessions were already as the draft has them.</p>
          )}
        </section>
      ) : null}
    </>
  );
}
