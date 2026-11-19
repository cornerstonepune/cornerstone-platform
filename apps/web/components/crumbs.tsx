import Link from "@/components/link";
import type { Crumb } from "@/lib/detail-trail";

// The full path above a curriculum page's title: every part a link, the page itself last and plain (Nimish, 19 Nov 2026). On a phone
// only the first, the parent and the page itself stay, so the path is one line; the parent is the way back.
export function Crumbs({ parts, here }: { parts: Crumb[]; here: string }) {
  const parent = parts.length - 1;
  return (
    <nav aria-label="Where you are" data-trail data-crumbs className="mb-[var(--space-1)] min-w-0 print:hidden">
      <ol className="flex flex-wrap items-center gap-x-[var(--space-1)] text-[length:var(--text-label)] text-[var(--ink-muted)]">
        {parts.map((c, i) => (
          <li key={`${c.label}-${i}`} className={`inline-flex min-w-0 items-center gap-[var(--space-1)] ${i > 0 && i < parent ? "max-sm:hidden" : ""}`}>
            <Link href={c.href ?? "#"} data-trail-door={i === 0 ? "" : undefined} data-crumb className="inline-flex min-h-[var(--tap)] items-center text-[var(--link)] underline">
              {c.label}
            </Link>
            <span aria-hidden="true">›</span>
          </li>
        ))}
        <li className="min-w-0 max-w-full">
          <span aria-current="page" className="block truncate font-semibold text-[var(--ink)]">
            {here}
          </span>
        </li>
      </ol>
    </nav>
  );
}
