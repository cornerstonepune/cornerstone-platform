import Link from "@/components/link";

// The strip of counts at the top of a page (D-075): what the page holds, each count a link to the first of what it
// counts. A count of nothing is shown and not linked.
const BOX = "inline-flex min-h-[var(--tap)] items-center gap-[var(--space-1)] rounded-[var(--radius-control)] border border-[var(--line)] px-[var(--space-3)]";

export function Summary({ items }: { items: { label: readonly [string, string]; n: number; href?: string }[] }) {
  return (
    <ul data-summary className="mb-[var(--space-3)] flex flex-wrap gap-[var(--space-2)]">
      {items.map((i) => {
        const body = (
          <>
            <span className="font-semibold tabular-nums">{i.n}</span> {i.label[i.n === 1 ? 0 : 1]}
          </>
        );
        return (
          <li key={i.label[1]}>
            {i.href && i.n ? (
              <Link href={i.href} className={`${BOX} text-[var(--ink)] no-underline hover:border-[var(--line-control)]`}>
                {body}
              </Link>
            ) : (
              <span className={`${BOX} text-[var(--ink-muted)]`}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
