"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ItemPicker } from "@/components/item-picker";
import { byLine, type ArrivedLine } from "@/lib/arrived-words";
import type { Picked } from "@/lib/catalogue-words";
import { recordArrived } from "./arrived-actions";

// Record what arrived, on the claim that bought it (CP-86): any number of items, each picked with the one item picker and given a quantity, saved together as one stock in
// per item, each naming the claim. It opens from a quiet button in the claim's panel (as Stock's forms open in an item's) and, once saved, the panel's Arrived tab reads
// what came. The engine's refusal comes back in its own words, beside the line it names; what was typed stays when it refuses, and nothing was saved.
type Row = { key: number; item: Picked | null; quantity: string };
type Said = { lines: Record<number, string>; rest: string[] };

const blank = (key: number): Row => ({ key, item: null, quantity: "" });

export function ArrivedForm({ claim, again }: { claim: string; again: boolean }) {
  const next = useRef(1);
  const [rows, setRows] = useState<Row[]>([blank(0)]);
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<Said | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const patch = (key: number, part: Partial<Row>) => {
    setRows((was) => was.map((r) => (r.key === key ? { ...r, ...part } : r)));
    setSaid(null);
  };
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(null);
    const used = rows.filter((r) => r.item || r.quantity.trim()); // a line left empty is not a line
    const unchosen = used.filter((r) => !r.item);
    if (unchosen.length) return setSaid({ lines: Object.fromEntries(unchosen.map((r) => [r.key, "Choose the item that came."])), rest: [] });
    const lines: ArrivedLine[] = used.flatMap((r) => (r.item ? [{ material_code: r.item.code, quantity: r.quantity }] : []));
    start(async () => {
      const r = await recordArrived(claim, lines);
      if (!r.ok) {
        const got = byLine(r.error, used.map((u) => u.item));
        return setSaid({ lines: Object.fromEntries(used.flatMap((u, i) => (got.lines[i] ? [[u.key, got.lines[i]]] : []))), rest: got.rest });
      }
      setRows([blank(next.current++)]);
      setSaid(null);
      setOpen(false);
      setDone(`Recorded: ${r.recorded} ${r.recorded === 1 ? "item" : "items"}.`);
      // the panel then reads what arrived: its own tab, and the page asks the engine again
      const url = new URL(location.href);
      url.searchParams.set("tab", "arrived");
      for (const k of ["did", "said", "filed", "error"]) url.searchParams.delete(k);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    });
  };
  return (
    <div className="min-w-0">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} data-arrived-form className="min-w-0">
        <summary className="btn secondary w-fit cursor-pointer">{again ? "Record more" : "Record what arrived"}</summary>
        <form onSubmit={send} noValidate className="b-form mt-[var(--space-2)]">
          {said?.rest.length ? (
            <p role="alert" data-error className="text-[var(--state-late)] [overflow-wrap:anywhere]">
              {said.rest.join(" ")}
            </p>
          ) : null}
          {rows.map((r, i) => (
            <div key={r.key} data-arrived-row className={`grid min-w-0 gap-[var(--space-2)]${i ? " border-t border-[var(--line)] pt-[var(--space-3)]" : ""}`}>
              <ItemPicker label={rows.length > 1 ? `Item ${i + 1}` : "Item"} value={r.item} onPick={(item) => patch(r.key, { item })} exclude={rows.flatMap((x) => (x.key !== r.key && x.item ? [x.item.code] : []))} hint="Type the item's name" />
              <div className="b-field" data-field="quantity">
                <label htmlFor={`arrived-q-${r.key}`}>{r.item ? `How many (${r.item.unit})` : "How many"}</label>
                <input
                  id={`arrived-q-${r.key}`}
                  value={r.quantity}
                  onChange={(e) => patch(r.key, { quantity: e.target.value })}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  aria-invalid={said?.lines[r.key] ? true : undefined}
                  aria-describedby={said?.lines[r.key] ? `arrived-e-${r.key}` : undefined}
                />
                {said?.lines[r.key] ? (
                  <p id={`arrived-e-${r.key}`} data-error className="[overflow-wrap:anywhere]">
                    {said.lines[r.key]}
                  </p>
                ) : null}
              </div>
              {rows.length > 1 ? (
                <div>
                  <button type="button" className="btn tertiary" onClick={() => setRows((was) => was.filter((x) => x.key !== r.key))}>
                    Remove this item
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-[var(--space-2)]">
            <button type="button" className="btn secondary" data-add-row onClick={() => setRows((was) => [...was, blank(next.current++)])}>
              Add another item
            </button>
            <button type="submit" className="btn" disabled={pending} aria-busy={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </details>
      {done ? (
        <p role="status" data-said="arrived" className="mt-[var(--space-2)] font-semibold">
          {done}
        </p>
      ) : null}
    </div>
  );
}
