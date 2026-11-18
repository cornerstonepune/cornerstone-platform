"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderChecked } from "@/lib/curriculum-order";
import { dateWords } from "@/lib/week";
import { checkOrder } from "./actions";
import "@/components/lesson-picker.css";

// CP-74: a subject's teaching order, under its open header. The units and objectives below are listed in that order; a coordinator who
// finds it right says so with one button (and can take it back). Until then a lesson is offered the whole subject, with nothing marked as
// next. Everyone reads who checked it and when; only a coordinator is given the button.
export function OrderLine({ grade, subject, name, checked, coordinator }: { grade: string; subject: string; name: string; checked?: OrderChecked; coordinator: boolean }) {
  const router = useRouter();
  const [why, setWhy] = useState<string | null>(null);
  const [pending, go] = useTransition();
  const say = (yes: boolean) =>
    go(async () => {
      const got = await checkOrder(grade, subject, yes);
      setWhy(got.ok ? null : got.why);
      if (got.ok) router.refresh();
    });
  return (
    <div className="lp-order" data-order-line={`${grade}~${subject}`} data-order-checked={checked ? "" : undefined}>
      <p>
        {checked
          ? `Order checked by ${checked.by} on ${dateWords(checked.on)}. A lesson is offered what comes next.`
          : "The units and objectives below are in teaching order. Not checked yet, so a lesson is offered the whole subject."}
        {why ? <span role="alert" className="text-[var(--state-late)]"> {why}</span> : null}
      </p>
      {coordinator ? (
        checked ? (
          <button type="button" className="btn tertiary" disabled={pending} onClick={() => say(false)} data-order-undo>
            Take it back<span className="sr-only"> for {name}</span>
          </button>
        ) : (
          <button type="button" className="btn secondary" disabled={pending} onClick={() => say(true)} data-order-right>
            This order is right<span className="sr-only"> for {name}</span>
          </button>
        )
      ) : null}
    </div>
  );
}
