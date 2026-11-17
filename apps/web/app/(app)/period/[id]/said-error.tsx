import type { ReactNode } from "react";
import { Card } from "@/components/cards";

/** A form's refusal, in the late colour: one small card for the four forms of a period (lesson, edit, activity, child levels). */
export function SaidError({ children }: { children: ReactNode }) {
  return (
    <Card as="p" role="alert" compact tone="quiet" className="[--card-bg:var(--state-late-bg)] border-[var(--state-late)] text-[var(--state-late)]">
      {children}
    </Card>
  );
}
