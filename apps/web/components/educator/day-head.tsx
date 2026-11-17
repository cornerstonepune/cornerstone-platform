import Link from "@/components/link";
import type { ClassRef } from "@/lib/educator/types";
import { classWords } from "@/lib/voice-types";
import { E } from "@/lib/educator/words";

// Her classes as a row of links, above the materials lists.
const STEP = "btn secondary min-w-[var(--tap)] px-[var(--space-2)] no-underline";

/** Her classes, when she holds more than one; one class shows nothing. */
export function ClassPick({ classes, on, href }: { classes: ClassRef[]; on: string; href: (id: string) => string }) {
  if (classes.length < 2) return null;
  return (
    <nav aria-label={E.pickClass} className="mb-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
      {classes.map((c) => (
        <Link key={c.id} href={href(c.id)} aria-current={c.id === on ? "page" : undefined} className={`${STEP} ${c.id === on ? "border-[var(--action)] bg-[var(--action-soft)] text-[var(--action-soft-ink)]" : ""}`}>
          {classWords(c)}
        </Link>
      ))}
    </nav>
  );
}
