"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { readBill, type Bill } from "@/lib/bill-file";
import type { Field } from "@/lib/money-claims";
import { fileClaim } from "../actions";

// File a claim (CP-80): one short form, top to bottom, the bill first. A phone's camera is the common case, so the bill has its own two big
// buttons (take a photo, choose a file) and everything else is a field of at least 44 px. Words of a refusal stand beside the field they are
// about. The bill is optional now: a claim says "no bill yet" and takes it later.
export type Start = { amount: string; spent_on: string; vendor: string; category: string; subcategory: string; campus: string; note: string };

function Row({ name, label, error, children }: { name: Field | "note"; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="b-field" data-field={name}>
      <label htmlFor={`claim-${name}`}>{label}</label>
      {children}
      {error ? (
        <p id={`claim-${name}-error`} data-error className="[overflow-wrap:anywhere]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ClaimForm({ categories, subcategories, campuses, today, start, from }: { categories: string[]; subcategories: Record<string, string[]>; campuses: string[]; today: string; start: Start; from: string | null }) {
  const [v, setV] = useState(start);
  const [bill, setBill] = useState<Bill | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field | "whole", string>>>({});
  const [pending, send] = useTransition();
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const set = (k: keyof Start) => (e: { target: { value: string } }) => setV((was) => ({ ...was, [k]: e.target.value, ...(k === "category" ? { subcategory: "" } : {}) }));
  const kinds = subcategories[v.category] ?? [];
  const bad = (k: Field) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `claim-${k}-error` } : {});

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const got = await readBill(file);
    if ("error" in got) return setErrors((was) => ({ ...was, bill: got.error }));
    setErrors((was) => ({ ...was, bill: undefined }));
    setBill(got);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const missing: typeof errors = {};
    if (!v.category) missing.category = "Choose what it was for.";
    if (!v.campus && campuses.length > 1) missing.campus = "Choose the campus.";
    setErrors(missing);
    if (Object.keys(missing).length) return;
    send(async () => {
      const said = await fileClaim({ ...v, bill: bill ? { b64: bill.b64, ext: bill.ext } : null, from });
      if (said) setErrors(said.field && (said.field !== "campus" || campuses.length > 1) ? { [said.field]: said.error } : { whole: said.error });
    });
  };

  return (
    <form onSubmit={submit} noValidate className="b-form" data-claim-form>
      {errors.whole ? (
        <p role="alert" data-error className="text-[var(--state-late)]">
          {errors.whole}
        </p>
      ) : null}
      <fieldset className="b-field" data-field="bill">
        <legend className="b-label">The bill</legend>
        {bill ? (
          <div className="flex items-center gap-[var(--space-2)]" data-bill-chosen>
            {bill.preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a local preview of the photo just chosen
              <img src={bill.preview} alt="The bill you chose" className="h-16 w-16 shrink-0 rounded-[var(--radius-control)] object-cover" />
            ) : null}
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{bill.name}</span>
            <button type="button" className="b-btn" onClick={() => setBill(null)} data-remove-bill>
              Remove
            </button>
          </div>
        ) : (
          <div className="grid gap-[var(--space-2)] min-[701px]:grid-cols-2">
            <button type="button" className="b-btn" onClick={() => camera.current?.click()} data-take-photo>
              Photograph the bill
            </button>
            <button type="button" className="b-btn" onClick={() => files.current?.click()} data-choose-file>
              Choose a file
            </button>
          </div>
        )}
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden data-bill-input="camera" onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={files} type="file" accept="image/*,application/pdf" hidden data-bill-input="file" onChange={(e) => pick(e.target.files?.[0])} />
        {errors.bill ? (
          <p id="claim-bill-error" data-error>
            {errors.bill}
          </p>
        ) : (
          <p className="b-muted b-label">{from && !bill ? "The bill of the claim sent back goes with it, unless you choose another." : "You can leave it for now and add it later."}</p>
        )}
      </fieldset>
      <Row name="amount" label="Amount (₹)" error={errors.amount}>
        <input id="claim-amount" name="amount" value={v.amount} onChange={set("amount")} inputMode="decimal" autoComplete="off" placeholder="0.00" {...bad("amount")} />
      </Row>
      <Row name="spent_on" label="Date" error={errors.spent_on}>
        <input id="claim-spent_on" name="spent_on" type="date" value={v.spent_on} max={today} onChange={set("spent_on")} {...bad("spent_on")} />
      </Row>
      <Row name="vendor" label="Who was paid" error={errors.vendor}>
        <input id="claim-vendor" name="vendor" value={v.vendor} onChange={set("vendor")} maxLength={120} autoComplete="off" enterKeyHint="next" {...bad("vendor")} />
      </Row>
      <Row name="category" label="What for" error={errors.category}>
        <select id="claim-category" name="category" value={v.category} onChange={set("category")} {...bad("category")}>
          <option value="">Choose</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Row>
      {kinds.length ? (
        <Row name="subcategory" label="Which one (optional)" error={errors.subcategory}>
          <select id="claim-subcategory" name="subcategory" value={v.subcategory} onChange={set("subcategory")} {...bad("subcategory")}>
            <option value="">Not one of these</option>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Row>
      ) : null}
      {campuses.length > 1 ? (
        <Row name="campus" label="Campus" error={errors.campus}>
          <select id="claim-campus" name="campus" value={v.campus} onChange={set("campus")} {...bad("campus")}>
            <option value="">Choose</option>
            {campuses.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Row>
      ) : null}
      <Row name="note" label="Note (optional)">
        <textarea id="claim-note" name="note" value={v.note} onChange={set("note")} rows={3} maxLength={500} className="py-[var(--space-1)]" />
      </Row>
      <div>
        <button type="submit" className="btn w-full min-[701px]:w-auto" disabled={pending} data-ux="action" data-file-claim>
          {pending ? "Filing…" : "File the claim"}
        </button>
      </div>
    </form>
  );
}
