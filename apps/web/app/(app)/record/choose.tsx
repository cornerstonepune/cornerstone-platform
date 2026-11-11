"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startTyped } from "../notes/actions";

/** Which period: the lessons of today, chosen in the address (`?session=`), so the page and the rail follow it. */
export function PeriodField({ options, chosen, classId }: { options: { id: string; label: string }[]; chosen?: string; classId: string }) {
  const router = useRouter();
  return (
    <label className="grid gap-1 text-[14px]">
      Which period
      <select
        className="select max-w-md"
        value={chosen ?? ""}
        onChange={(e) => router.replace(e.target.value ? `/record?class=${classId}&session=${e.target.value}` : `/record?class=${classId}`)}
      >
        <option value="">Not about one period</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Type the marks: the empty note for this class (and period), opened on the confirm screen. `main` when the microphone is not an option. */
export function TypeMarks({ classId, sessionId, main }: { classId: string; sessionId?: string; main?: boolean }) {
  const [said, setSaid] = useState<string | null>(null);
  const [pending, go] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={main ? "btn min-h-14 w-full justify-center" : "btn secondary min-h-14 w-full justify-center min-[700px]:w-auto"}
        data-typed
        onClick={() =>
          go(async () => {
            const out = await startTyped(classId, sessionId);
            if (out?.error) setSaid(out.error);
          })
        }
      >
        Type the marks
      </button>
      {said ? <p role="alert" className="text-[14px] text-terracotta">{said}</p> : null}
    </>
  );
}
