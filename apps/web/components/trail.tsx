"use client";

import Link from "@/components/link";
import { useWalk } from "./frame/walk";

// Where she is: two fixed levels, the door and then the thing (docs/frontend/SPEC.md §3), plus the browser's Back. The door is
// the one lit on the bar, so the walk's own door; the thing is the page itself. Nothing deeper: a deeper path is the Back button's.
export function Trail({ thing }: { thing: string }) {
  const { doors, lit } = useWalk();
  const door = doors.find((d) => d.key === lit);
  return (
    <nav aria-label="Where you are" data-trail className="mb-[var(--space-2)] print:hidden">
      <ol className="flex flex-wrap items-center gap-[var(--space-1)] text-[length:var(--text-label)] text-[var(--ink-muted)]">
        {door ? (
          <li className="inline-flex items-center gap-[var(--space-1)]">
            <Link href={door.href} data-trail-door className="inline-flex min-h-[var(--tap)] min-w-[var(--tap)] items-center text-[var(--link)] underline">
              {door.label}
            </Link>
            <span aria-hidden="true">›</span>
          </li>
        ) : null}
        <li>
          <span aria-current="page" className="font-medium text-[var(--ink)]">
            {thing}
          </span>
        </li>
      </ol>
    </nav>
  );
}
