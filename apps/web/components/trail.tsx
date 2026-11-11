"use client";

import Link from "@/components/link";
import { useWalk } from "./frame/walk";
import { Icon } from "@/lib/icons";
import { DoorPages } from "./frame/doors";

// Where she is: two fixed levels, the door and then the thing (docs/frontend/SPEC.md §3), plus the browser's Back. The door is
// the one lit on the bar, so the walk's own door; the thing is the page itself. Nothing deeper: a deeper path is the Back button's.
export function Trail({ thing }: { thing: string }) {
  const { doors, lit } = useWalk();
  const door = doors.find((d) => d.key === lit);
  return (
    <div className="mb-[var(--space-1)] flex items-center gap-[var(--space-2)] print:hidden">
    <nav aria-label="Where you are" data-trail className="min-w-0">
      <ol className="flex flex-nowrap items-center gap-[var(--space-1)] text-[length:var(--text-label)] text-[var(--ink-muted)]">
        {door ? (
          <li className="inline-flex shrink-0 items-center gap-[var(--space-1)]">
            <Link href={door.href} data-trail-door className="inline-flex min-h-[var(--tap)] min-w-[var(--tap)] items-center text-[var(--link)] underline">
              {door.label}
            </Link>
            <span aria-hidden="true">›</span>
          </li>
        ) : null}
        <li className="min-w-0">
          {/* one line: a long title is cut here and said in full by the heading just below */}
          <span aria-current="page" className="block truncate font-medium text-[var(--ink)]">
            {thing}
          </span>
        </li>
      </ol>
    </nav>
    <DoorPages />
    </div>
  );
}

/** The lit door's icon before a page's eyebrow, as the wireframes draw it (the page names none of its own). */
export function DoorIcon() {
  const { doors, lit } = useWalk();
  const door = doors.find((d) => d.key === lit);
  return door ? <Icon name={door.icon} size={16} /> : null;
}
