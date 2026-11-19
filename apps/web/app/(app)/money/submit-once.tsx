"use client";
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// The button that decides a claim (CP-80): once pressed it waits, so a second press cannot decide the same claim twice. `main`: the one filled button of the view.
export function SubmitOnce({ children, busy, main }: { children: ReactNode; busy: string; main?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} data-ux={main ? "action" : undefined} className={main ? "btn" : "btn secondary"}>
      {pending ? busy : children}
    </button>
  );
}
