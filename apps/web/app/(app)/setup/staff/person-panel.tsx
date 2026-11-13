import { EmptyState } from "@/components/empty-state";
import { KeyValue } from "@/components/key-value";
import type { Opened } from "@/components/detail-panel";
import type { Givable } from "@/lib/grants";
import type { Grant, StaffLine } from "@/lib/queries-coordinator";
import { AddGrant, EndGrant } from "./grant-forms";

// One member of staff in the detail panel of Staff (page charter Part C, "Staff · Classes: keep, Workspace"): tabs Grants (every grant they
// were given, open or ended, with End on an open one and Add a grant under them) · Roles (what they hold today, and the three whole counts
// the database stands behind, never ranked). The name is the staff list's, which the page reads only for a viewer who may see names.
export const PERSON_TABS = ["grants", "roles"] as const;

export function personOpened(
  p: StaffLine,
  o: { grants: readonly Grant[]; options: Givable | null; byName: (by: string) => string; tab?: string; closeHref: string },
): Opened {
  const endable = new Set(o.options?.roles.map((r) => r.code));
  const held = o.grants.filter((g) => g.open);
  const grants = (
    <div className="grid gap-[var(--space-2)]" data-grants>
      {o.grants.length ? (
        <ul className="grid gap-[var(--space-1)]" aria-label={`${p.name}'s grants`}>
          {o.grants.map((g) => (
            <li key={g.id} data-grant={g.id} className="border-b border-[var(--line)] py-[var(--space-1)] text-[length:var(--text-label)]">
              {g.roleLabel} · {g.className ?? "every class"} · {g.subject ?? "every subject"} · from {g.from} to {g.to ?? "open"} · granted by {o.byName(g.by)}
              {g.open ? null : " · Ended"}
              {g.open && endable.has(g.roleCode) ? (
                <>
                  {" "}
                  <EndGrant grantId={g.id} what={`${g.roleLabel}, ${g.className ?? "every class"}`} />
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No grant yet: this person holds no class.</EmptyState>
      )}
      {o.options ? <AddGrant key={p.id} staffId={p.id} options={o.options} /> : <p className="b-caption">Changing a grant is not available right now.</p>}
    </div>
  );
  const roles = (
    <div className="grid gap-[var(--space-3)]" data-roles>
      {held.length ? (
        <ul className="grid gap-[var(--space-1)] text-[length:var(--text-label)]" aria-label={`What ${p.name} holds today`}>
          {held.map((g) => (
            <li key={g.id}>
              {g.roleLabel} · {g.className ?? "every class"}
              {g.subject ? ` · ${g.subject}` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className="b-caption">Holds no grant open today.</p>
      )}
      <KeyValue
        rows={[
          { label: "Sessions done of planned", value: p.planned ? `${p.done} of ${p.planned}` : "none planned", num: true },
          { label: "Notes confirmed", value: String(p.notesConfirmed ?? "not available"), num: true },
          { label: "Notes late", value: String(p.notesLate ?? "not available"), num: true },
          { label: "Lines accepted / changed / removed", value: p.lines ? `${p.lines.accepted} / ${p.lines.changed} / ${p.lines.removed}` : "none yet", num: true },
        ]}
      />
    </div>
  );
  return {
    key: `person:${p.id}`,
    kind: "period",
    icon: "educator",
    title: p.name,
    line: `${p.roleLabel} · ${p.classes ? p.classes.join(", ") : "every class"}`,
    closeHref: o.closeHref,
    tabs: [
      { key: "grants", label: "Grants", body: grants },
      { key: "roles", label: "Roles", body: roles },
    ],
    tab: o.tab,
  };
}
