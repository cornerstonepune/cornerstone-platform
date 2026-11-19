"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { readBill } from "@/lib/bill-file";
import { addBill } from "./actions";

// The two client parts of a claim's panel: the bill's picture (a PDF is a file, not a picture, so the picture gives way to a link) and
// "Add the bill", which takes a photo or a file straight from the phone's own chooser and sends it as soon as it is chosen.
export function BillPicture({ id }: { id: string }) {
  const [file, setFile] = useState(false);
  return (
    <div className="grid gap-[var(--space-2)]" data-bill-picture>
      {file ? (
        <p className="b-muted">This bill is a file, not a picture.</p>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a private picture the engine serves, behind the sign-in; nothing to optimise
        <img src={`/money/bill/${id}`} alt="The bill" onError={() => setFile(true)} className="h-auto w-full max-h-[70dvh] object-contain" />
      )}
      <a href={`/money/bill/${id}`} target="_blank" rel="noopener noreferrer" className="b-btn">
        Open the bill
      </a>
    </div>
  );
}

export function AddBill({ id }: { id: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [said, setSaid] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setSaid(null);
    const bill = await readBill(file);
    if ("error" in bill) return setSaid(bill.error);
    start(async () => {
      const error = await addBill(id, bill);
      if (error) setSaid(error);
      else router.refresh();
    });
  };
  return (
    <>
      <button type="button" className="b-btn" disabled={pending} onClick={() => input.current?.click()} data-add-bill>
        {pending ? "Adding the bill…" : "Add the bill"}
      </button>
      <input ref={input} type="file" accept="image/*,application/pdf" hidden data-bill-input onChange={(e) => pick(e.target.files?.[0])} />
      {said ? (
        <p role="alert" data-error className="basis-full text-[var(--state-late)]">
          {said}
        </p>
      ) : null}
    </>
  );
}
