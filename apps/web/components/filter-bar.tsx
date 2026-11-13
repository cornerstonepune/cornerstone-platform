"use client";

import Link from "next/link";
import { useRef } from "react";

// The one filter row over every table (docs/ux-rules.md, rule 9): dropdown filters, a compact search, the filters that
// are on shown beside them with a × each, and one click to clear them all. In the same place on every page, between the
// page's heading and its table. It is a plain GET form: the filters are in the address, so a filtered list can be sent to
// a colleague, and a page needs no script of its own. Choosing a dropdown shows the result at once. One row (page charter A4): the first
// `shown` dropdowns sit in it and the rest wait behind "More filters", which says how many of them are on; a phone may wrap the row.
export type Filter = {
  name: string;
  label: string;
  /** The chosen value, if any. */
  value?: string;
  /** The words for "no filter": "Every class". */
  all: string;
  options: readonly (readonly [string, string])[];
  /** Always one of the options (a page of one class at a time): no "all" choice, and nothing to take off. */
  required?: boolean;
  /** The value is the page's own starting choice (a grade the page opens on), not one the person made: it keeps its "all" choice and shows no chip. */
  starting?: boolean;
  /** The options in labelled groups (a Live and a Planning list): each group names option values from `options`; one in no group follows them. */
  groups?: readonly { label: string; values: readonly string[] }[];
};

/** The dropdowns a filter row shows before "More filters" (page charter A4: one row). */
export const FILTERS_IN_ROW = 3;

export function FilterBar({
  action,
  filters,
  search,
  keep = {},
  shown = FILTERS_IN_ROW,
}: {
  /** The page's own path. */
  action: string;
  filters: readonly Filter[];
  search?: { name: string; value?: string; placeholder: string; label?: string };
  /** What the page keeps while filtering (a chosen week, a tab) and never shows as a filter. */
  keep?: Record<string, string | undefined>;
  /** How many dropdowns sit in the row before "More filters". */
  shown?: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const on = [
    ...filters.flatMap((f) =>
      f.value && !f.required && !f.starting ? [{ name: f.name, label: `${f.label}: ${f.options.find(([v]) => v === f.value)?.[1] ?? f.value}` }] : [],
    ),
    ...(search?.value ? [{ name: search.name, label: `Search: “${search.value}”` }] : []),
  ];
  const href = (without: string[]) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);
    for (const f of filters) if (f.value && !without.includes(f.name)) q.set(f.name, f.value);
    if (search?.value && !without.includes(search.name)) q.set(search.name, search.value);
    const s = q.toString();
    return s ? `${action}?${s}` : action;
  };
  // One slim bar (13 Nov 2026, "the filters look crowded"): each filter a rounded chip with its label inside it, the search at the end of the
  // same bar, and the space below it a block's gap, so the list under it never touches it.
  const chip =
    "inline-flex min-h-[var(--tap)] max-w-full min-w-0 items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--ground)] pl-[var(--space-3)] pr-[var(--space-1)] text-[length:var(--text-label)] text-[var(--ink-muted)] transition-colors duration-100 hover:border-[var(--line-control)] focus-within:border-[var(--ink)]";
  const bare =
    "min-h-[calc(var(--tap)-2px)] min-w-0 max-w-[15rem] text-ellipsis cursor-pointer rounded-[var(--radius-pill)] border-0 bg-transparent pr-[var(--space-1)] text-[length:var(--text-body)] font-medium text-[var(--ink)] focus:outline-none";
  const moreOn = filters.slice(shown).filter((f) => f.value && !f.required && !f.starting).length;
  const drop = (f: Filter) => (
    <label key={f.name} className={chip}>
      <span className="whitespace-nowrap">{f.label}</span>
      <select data-filter="" name={f.name} defaultValue={f.value ?? ""} onChange={() => form.current?.requestSubmit()} className={bare}>
        {f.required ? null : <option value="">{f.all}</option>}
        {f.groups
          ? [
              ...f.groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {f.options
                    .filter(([v]) => g.values.includes(v))
                    .map(([v, words]) => (
                      <option key={v} value={v}>
                        {words}
                      </option>
                    ))}
                </optgroup>
              )),
              ...f.options
                .filter(([v]) => !f.groups!.some((g) => g.values.includes(v)))
                .map(([v, words]) => (
                  <option key={v} value={v}>
                    {words}
                  </option>
                )),
            ]
          : f.options.map(([v, words]) => (
              <option key={v} value={v}>
                {words}
              </option>
            ))}
      </select>
    </label>
  );
  return (
    <section data-block="FilterBar" data-filterbar aria-label="Filters" className="mb-[var(--space-3)] min-w-0 max-w-full">
      <form
        ref={form}
        action={action}
        method="get"
        role="search"
        className="flex flex-wrap items-center gap-[var(--space-2)] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] p-[var(--space-1)] max-[700px]:flex-nowrap max-[700px]:overflow-x-auto [&>*]:shrink-0"
      >
        {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        {filters.slice(0, shown).map(drop)}
        {filters.length > shown ? (
          // closed: one button, as tall as the row's dropdowns (stretched to the line). Open (as it stands while one of its filters is on):
          // a line of its own under the row, its dropdowns beside the button, in the page's flow, so it never lies over the list below
          <details data-more-filters className="flex flex-wrap items-center gap-[var(--space-2)] [&[open]]:basis-full" open={moreOn > 0 || undefined}>
            <summary className="inline-flex min-h-[var(--tap)] cursor-pointer items-center gap-[var(--space-1)] whitespace-nowrap rounded-[var(--radius-pill)] px-[var(--space-3)] text-[length:var(--text-label)] font-medium text-[var(--ink)] hover:bg-[var(--surface)]">
              More filters{moreOn ? ` (${moreOn} on)` : ""}
            </summary>
            <div className="flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
              {filters.slice(shown).map(drop)}
            </div>
          </details>
        ) : null}
        {search ? (
          <label className="relative ml-auto flex items-center max-[700px]:ml-0">
            <span className="sr-only">{search.label ?? "Search the list"}</span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="pointer-events-none absolute left-3 text-[var(--ink-muted)]"
            >
              <circle cx="7" cy="7" r="4.6" />
              <path d="M10.6 10.6L14 14" />
            </svg>
            <input
              data-filter=""
              type="search"
              name={search.name}
              defaultValue={search.value ?? ""}
              placeholder={search.placeholder}
              autoComplete="off"
              className="min-h-[var(--tap)] w-[min(100%,260px)] rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--ground)] pr-[var(--space-3)] pl-9 text-[length:var(--text-body)] text-[var(--ink)] transition-[width,border-color] duration-150 placeholder:text-[var(--ink-muted)] focus:w-[min(100%,340px)] focus:border-[var(--ink)] focus:outline-none"
            />
          </label>
        ) : null}
        <noscript>
          <button type="submit" className="btn secondary">
            Show
          </button>
        </noscript>
      </form>
      {on.length ? (
        <ul data-active-filters aria-label="Filters on" className="mt-[var(--space-2)] flex flex-wrap items-center gap-[var(--space-2)] text-[length:var(--text-label)]">
          {on.map((a) => (
            <li key={a.name}>
              <Link
                href={href([a.name])}
                data-chip
                aria-label={`Remove filter ${a.label}`}
                className="inline-flex min-h-8 items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] border border-[var(--line)] bg-[var(--surface)] px-[var(--space-2)] text-[var(--ink)] no-underline hover:border-[var(--ink)]"
              >
                {a.label}
                <span aria-hidden="true">×</span>
              </Link>
            </li>
          ))}
          <li>
            <Link href={href(on.map((a) => a.name))}>
              Clear
            </Link>
          </li>
        </ul>
      ) : null}
    </section>
  );
}
