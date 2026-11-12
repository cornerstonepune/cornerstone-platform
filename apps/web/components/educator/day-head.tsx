import Link from "@/components/link";
import type { ClassRef } from "@/lib/educator/types";
import { classWords } from "@/lib/voice-types";
import { E } from "@/lib/educator/words";

// Her classes as a row of links, above the materials lists.
const STEP = "inline-flex min-h-[var(--tap)] min-w-[var(--tap)] items-center justify-center gap-[var(--space-1)] rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] px-[var(--space-2)] text-[length:var(--text-label)] font-medium text-[var(--ink)] no-underline";

/** Her classes, when she holds more than one; one class shows nothing. */
export function ClassPick({ classes, on, href }: { classes: ClassRef[]; on: string; href: (id: string) => string }) {
  if (classes.length < 2) return null;
  return (
    <nav aria-label={E.pickClass} className="mb-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
      {classes.map((c) => (
        <Link key={c.id} href={href(c.id)} aria-current={c.id === on ? "page" : undefined} className={`${STEP} ${c.id === on ? "border-[var(--action)] bg-[var(--action)] text-[var(--action-ink)]" : ""}`}>
          {classWords(c)}
        </Link>
      ))}
    </nav>
  );
}
