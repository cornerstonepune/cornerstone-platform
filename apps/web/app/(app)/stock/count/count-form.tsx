"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { needReason, qty, type CountLine, type StockItem } from "@/lib/stock-words";
import { countStore } from "../actions";

// The count (CP-82): one line per item, the books beside it and a box for what is on the shelf. A line left empty is not counted. The whole count goes in one
// call; if the engine refuses it, nothing was saved, its words stand at the top and a reason box opens under each line it says needs one. The button waits
// while the count is sent, so a second press cannot count twice. Every control is at least 44 px tall, one under the other, on a phone.
const sayDifference = (l: CountLine) => (l.difference === 0 ? "the same as the books said" : `${qty(Math.abs(l.difference))} ${l.difference > 0 ? "more" : "fewer"} than the books said`);

export function CountForm({ campus, items, reasons }: { campus: string; items: StockItem[]; reasons: string[] }) {
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [why, setWhy] = useState<Record<string, string>>({});
  const [asked, setAsked] = useState<string[]>([]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [kept, setKept] = useState<CountLine[] | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const lines = items.filter((i) => (counted[i.code] ?? "").trim() !== "").map((i) => ({ material_code: i.code, counted: counted[i.code], reason: why[i.code] ?? "" }));
    start(async () => {
      const r = await countStore(campus, lines);
      if (r.ok) {
        setKept(r.lines);
        setRefusal(null);
        setAsked([]);
        setCounted({});
        setWhy({});
        router.refresh();
      } else {
        setKept(null);
        setRefusal(r.error);
        const need = needReason(r.error, items.map((i) => i.name));
        setAsked((was) => [...new Set([...was, ...items.filter((i) => need.includes(i.name)).map((i) => i.code)])]);
      }
    });
  };

  return (
    <form onSubmit={send} noValidate className="b-form" data-count-form>
      {refusal ? (
        <p role="alert" data-error data-refused className="text-[var(--state-late)] [overflow-wrap:anywhere]">
          {refusal}
        </p>
      ) : null}
      {kept ? (
        <div role="status" data-counted className="grid gap-[var(--space-1)]">
          <p className="font-semibold">Counted. The store now holds what you typed.</p>
          <ul className="grid gap-[var(--space-1)]">
            {kept.map((l) => (
              <li key={l.material_code} data-counted-line={l.material_code}>
                {l.item}: {qty(l.counted)} {l.unit}, {sayDifference(l)}.
              </li>
            ))}
          </ul>
          <p>
            <Link href="/stock" className="underline underline-offset-2">
              Back to On hand
            </Link>
          </p>
        </div>
      ) : null}
      <ul className="grid gap-[var(--space-3)]" data-count-lines>
        {items.map((i) => (
          <li key={i.code} className="b-field" data-count-line={i.code}>
            <label htmlFor={`counted-${i.code}`} className="[overflow-wrap:anywhere]">
              <b>{i.name}</b>
              <span className="b-muted b-label block">
                The books say {qty(i.on_hand)} {i.unit}
              </span>
            </label>
            <input id={`counted-${i.code}`} name={i.code} value={counted[i.code] ?? ""} onChange={(e) => setCounted((was) => ({ ...was, [i.code]: e.target.value }))} inputMode="decimal" autoComplete="off" />
            {asked.includes(i.code) ? (
              <div className="b-field" data-reason-for={i.code}>
                <label htmlFor={`why-${i.code}`}>Why does it differ?</label>
                <input id={`why-${i.code}`} name={`why-${i.code}`} value={why[i.code] ?? ""} onChange={(e) => setWhy((was) => ({ ...was, [i.code]: e.target.value }))} list="count-reasons" maxLength={200} autoComplete="off" />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <datalist id="count-reasons">
        {reasons.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <div>
        <button type="submit" className="btn w-full min-[701px]:w-auto" disabled={pending} aria-busy={pending} data-ux="action" data-save-count>
          {pending ? "Saving the count…" : "Save the count"}
        </button>
      </div>
    </form>
  );
}
