import Link from "@/components/link";

// The engine shows a class's lessons to the class's own educator and to staff whose current role is on the school's coordinator list
// (`educator_gate.sees_all`, config `k2.reads`). Anyone else is refused, and the page says so in plain words, neutral and not a success
// box, with the way on. It reads nothing and works around nothing: the gate is the engine's, and the school's head decides who is on the list.
export function GridRefused({ lessons, fortnight, next }: { lessons?: number; fortnight: number; next?: { href: string; label: string } }) {
  return (
    <section aria-label="The grid is not shown to you" data-grid-refused className="mb-4 grid gap-[var(--space-2)] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-[var(--space-3)] text-[length:var(--text-body)]">
      <p className="font-medium">The timetable grid is not shown to you.</p>
      <p className="max-w-[62ch]">
        It is shown to a class&rsquo;s own educator and to staff whose current role is on the school&rsquo;s coordinator list. Yours is not, so ask the school&rsquo;s head to add it.
        {lessons ? ` ${lessons} lesson${lessons === 1 ? " is" : "s are"} placed for this class in Fortnight ${fortnight}; you can see them on its fortnight page.` : ""}
      </p>
      {next ? (
        <p>
          <Link href={next.href} className="chip">
            {next.label}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
