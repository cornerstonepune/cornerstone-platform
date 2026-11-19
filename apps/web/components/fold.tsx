import { Icon } from "@/lib/icons";

/** A card that folds: its summary is a 44 px row with a chevron that points right while shut and down once open (the curriculum detail pages' folds). */
export function Fold({ summary, open, id, children }: { summary: React.ReactNode; open?: boolean; id?: string; children: React.ReactNode }) {
  return (
    <section className="card" data-card id={id} data-section={id}>
      <details open={open}>
        <summary className="flex min-h-[var(--tap)] cursor-pointer list-none items-center gap-[var(--space-1)] font-semibold">
          <span aria-hidden className="inline-flex -rotate-90 transition-transform motion-reduce:transition-none [details[open]>summary_&]:rotate-0">
            <Icon name="chevron-down" size={16} />
          </span>
          {summary}
        </summary>
        <div className="mt-[var(--space-2)]">{children}</div>
      </details>
    </section>
  );
}
