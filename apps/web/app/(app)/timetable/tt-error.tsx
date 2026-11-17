import type { ReactNode } from "react";
import { Card } from "@/components/cards";

/** A timetable form's refusal: one small card in the late colour (its tint and edge are the `.tt-error` rule in timetable.css). */
export function TtError({ children }: { children: ReactNode }) {
  return (
    <Card as="p" role="alert" compact tone="quiet" className="tt-error">
      {children}
    </Card>
  );
}

/** Where a timetable list has nothing yet: a dashed card, not a bare line. */
export function TtEmpty({ children }: { children: ReactNode }) {
  return (
    <Card as="p" tone="dashed" className="tt-empty">
      {children}
    </Card>
  );
}
