"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ItemPicker } from "@/components/item-picker";
import type { Picked } from "@/lib/catalogue-words";
import { fieldOf } from "@/lib/stock-words";
import { record } from "./actions";

// Stock in any item of the catalogue (CP-84b, closing the gap CP-82 named): the item is chosen with the one picker, so a keeper can record the first stock of an
// item the campus has never held, or add the item itself when the list lacks it. What the engine says is shown in its own words beside the field it names.
type Said = { field: "quantity" | "claim" | null; words: string };

export function StockInAny({ campus, claims }: { campus: string; claims: { id: string; label: string }[] }) {
  const [item, setItem] = useState<Picked | null>(null);
  const [quantity, setQuantity] = useState("");
  const [claim, setClaim] = useState("");
  const [error, setError] = useState<Said | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(null);
    if (!item) return setError({ field: null, words: "Choose the item that came." });
    start(async () => {
      const r = await record("in", { campus, code: item.code, quantity, class_label: "", claim, minimum: "", reason: "" });
      if (r.ok) {
        setDone(`Stock in recorded: ${quantity.trim()} ${item.unit} of ${item.name}.`);
        setItem(null);
        setQuantity("");
        setClaim("");
        setError(null);
        router.refresh();
      } else {
        const field = fieldOf(r.error);
        setError({ field: field === "quantity" || field === "claim" ? field : null, words: r.error });
      }
    });
  };
  const bad = (f: "quantity" | "claim") => (error?.field === f ? { "aria-invalid": true, "aria-describedby": `in-any-${f}-error` } : {});
  return (
    <details data-stock-form="in-any" className="min-w-0">
      <summary className="btn secondary w-fit cursor-pointer">Stock in an item</summary>
      <form onSubmit={send} noValidate className="b-form mt-[var(--space-2)]">
        {error && !error.field ? (
          <p role="alert" data-error className="text-[var(--state-late)] [overflow-wrap:anywhere]">
            {error.words}
          </p>
        ) : null}
        <ItemPicker label="Item" value={item} onPick={setItem} hint="Type the item's name" />
        <div className="b-field" data-field="quantity">
          <label htmlFor="in-any-quantity">{item ? `How many (${item.unit})` : "How many"}</label>
          <input id="in-any-quantity" name="quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" {...bad("quantity")} />
          {error?.field === "quantity" ? (
            <p id="in-any-quantity-error" data-error className="[overflow-wrap:anywhere]">
              {error.words}
            </p>
          ) : null}
        </div>
        <div className="b-field" data-field="claim">
          <label htmlFor="in-any-claim">Bought on a claim (optional)</label>
          <select id="in-any-claim" name="claim" value={claim} onChange={(e) => setClaim(e.target.value)} {...bad("claim")}>
            <option value="">No claim</option>
            {claims.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {error?.field === "claim" ? (
            <p id="in-any-claim-error" data-error className="[overflow-wrap:anywhere]">
              {error.words}
            </p>
          ) : null}
        </div>
        <div>
          <button type="submit" className="btn w-full min-[701px]:w-auto" disabled={pending} aria-busy={pending}>
            {pending ? "Recording…" : "Record stock in"}
          </button>
        </div>
        {done ? (
          <p role="status" data-said="in-any" className="font-semibold">
            {done}
          </p>
        ) : null}
      </form>
    </details>
  );
}
