import { Icon } from "@/lib/icons";
import { E } from "@/lib/educator/words";

// The amber "to confirm" chip: shown where a line has no quantity yet. Never guessed, never a zero.
export function ToConfirm() {
  return (
    <span data-chip="toConfirm" className="inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] border px-[var(--space-2)] py-[var(--space-1)] text-[length:var(--text-label)] font-medium" style={{ color: "var(--ink)", borderColor: "var(--state-wait)" }}>
      <Icon name="to-confirm" size={16} />
      {E.materials.toConfirm}
    </span>
  );
}
