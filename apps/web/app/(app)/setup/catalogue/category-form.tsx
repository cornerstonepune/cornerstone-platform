"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeCategory } from "./actions";

// An item's category, changed in its row by a coordinator or above (CP-84b): the school's categories in a list and one button. What the engine says is shown in its own
// words under the row's control; the engine keeps who changed it and what it was.
export function CategoryForm({ code, name, current, categories }: { code: string; name: string; current: string | null; categories: readonly string[] }) {
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = () =>
    start(async () => {
      const r = await changeCategory(code, value);
      setError(r.ok ? null : r.error);
      if (r.ok) router.refresh();
    });
  return (
    <div data-category-form={code} className="grid gap-[var(--space-1)]">
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <select aria-label={`Category of ${name}`} value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[var(--tap)] min-w-0 max-w-full rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--ground)] px-[var(--space-2)] text-[var(--ink)]">
          {current === null ? <option value="">Choose a category</option> : null}
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" className="btn secondary" aria-label={`Save the category of ${name}`} onClick={save} disabled={pending || !value || value === (current ?? "")} aria-busy={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error ? (
        <p role="alert" data-error className="text-[var(--state-late)] [overflow-wrap:anywhere]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
