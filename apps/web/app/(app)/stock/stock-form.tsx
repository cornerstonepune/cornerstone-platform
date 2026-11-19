"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fieldOf, type Field } from "@/lib/stock-words";
import { record, type Kind } from "./actions";

// One thing done to one item, in the item's panel (CP-82): stock in, hand out, set the minimum, write off. Each opens from its own button, takes a few
// fields of at least 44 px and says what the engine said, in words, beside the field it names; what was typed stays when the engine refuses it.
const FORMS: Record<Kind, { open: string; send: string; busy: string; said: string; fields: readonly Field[] }> = {
  in: { open: "Stock in", send: "Record stock in", busy: "Recording…", said: "Stock in recorded.", fields: ["quantity", "claim"] },
  out: { open: "Hand out", send: "Hand it out", busy: "Handing out…", said: "Handed out.", fields: ["class_label", "quantity"] },
  minimum: { open: "Set the minimum", send: "Save the minimum", busy: "Saving…", said: "Minimum saved.", fields: ["minimum"] },
  writeoff: { open: "Write off", send: "Write it off", busy: "Writing off…", said: "Written off.", fields: ["quantity", "reason"] },
};
const NONE = { quantity: "", class_label: "", claim: "", minimum: "", reason: "" };

export function StockForm({ kind, campus, code, unit, classes, claims, reasons }: { kind: Kind; campus: string; code: string; unit: string; classes: string[]; claims: { id: string; label: string }[]; reasons: string[] }) {
  const f = FORMS[kind];
  const [v, setV] = useState(NONE);
  const [error, setError] = useState<{ field: Field | null; words: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: Field) => (e: { target: { value: string } }) => setV((was) => ({ ...was, [k]: e.target.value }));
  const id = (k: Field) => `${kind}-${k}`;
  const bad = (k: Field) => (error?.field === k ? { "aria-invalid": true, "aria-describedby": `${id(k)}-error` } : {});
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    start(async () => {
      const r = await record(kind, { ...v, campus, code });
      if (r.ok) {
        setV(NONE);
        setError(null);
        setDone(true);
        router.refresh();
      } else {
        const field = fieldOf(r.error);
        setError({ field: field && f.fields.includes(field) ? field : null, words: r.error });
      }
    });
  };
  const label: Record<Field, string> = { quantity: `How many (${unit})`, class_label: "Which class", claim: "Bought on a claim (optional)", minimum: `Minimum (${unit})`, reason: "Why" };
  return (
    <details data-stock-form={kind} className="min-w-0">
      <summary className="btn secondary w-fit cursor-pointer">{f.open}</summary>
      <form onSubmit={send} noValidate className="b-form mt-[var(--space-2)]">
        {error && !error.field ? (
          <p role="alert" data-error className="text-[var(--state-late)] [overflow-wrap:anywhere]">
            {error.words}
          </p>
        ) : null}
        {f.fields.map((k) => (
          <div key={k} className="b-field" data-field={k}>
            <label htmlFor={id(k)}>{label[k]}</label>
            {k === "claim" ? (
              <select id={id(k)} name={k} value={v.claim} onChange={set(k)}>
                <option value="">No claim</option>
                {claims.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : k === "class_label" ? (
              <>
                <input id={id(k)} name={k} value={v.class_label} onChange={set(k)} list={`${id(k)}-list`} autoComplete="off" maxLength={40} {...bad(k)} />
                <datalist id={`${id(k)}-list`}>
                  {classes.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            ) : k === "reason" ? (
              <>
                <input id={id(k)} name={k} value={v.reason} onChange={set(k)} list={`${id(k)}-list`} maxLength={200} autoComplete="off" {...bad(k)} />
                <datalist id={`${id(k)}-list`}>
                  {reasons.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </>
            ) : (
              <input id={id(k)} name={k} value={v[k]} onChange={set(k)} inputMode="decimal" autoComplete="off" placeholder="0" {...bad(k)} />
            )}
            {error?.field === k ? (
              <p id={`${id(k)}-error`} data-error className="[overflow-wrap:anywhere]">
                {error.words}
              </p>
            ) : null}
          </div>
        ))}
        <div>
          <button type="submit" className="btn w-full min-[701px]:w-auto" disabled={pending} aria-busy={pending}>
            {pending ? f.busy : f.send}
          </button>
        </div>
        {done ? (
          <p role="status" data-said={kind} className="font-semibold">
            {f.said}
          </p>
        ) : null}
      </form>
    </details>
  );
}
