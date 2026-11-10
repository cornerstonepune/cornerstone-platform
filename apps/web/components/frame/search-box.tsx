"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/lib/icons";

// The search in the bar: a typeahead with no results page (docs/frontend/screens.json `bar`). What is typed goes in the body of a
// POST to /api/search and nowhere else: not in an address, not in a log line, not in any analytics call (there is none). At most
// five suggestions come back; choosing one opens its screen. A field, not a form: nothing here can put the term in an address.
type Hit = { label: string; href: string };

export function SearchBox() {
  const [typed, setTyped] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [at, setAt] = useState(-1);
  const list = useId();
  const router = useRouter();
  const asked = useRef(0);

  useEffect(() => {
    const q = typed.trim();
    const mine = ++asked.current;
    if (!q) {
      // an empty field offers nothing: the suggestions are put away when the typing is
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHits(null);
      return;
    }
    const wait = setTimeout(async () => {
      try {
        const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }), cache: "no-store" });
        const got = res.ok ? ((await res.json()) as { hits: Hit[] }).hits : [];
        if (mine === asked.current) {
          setHits(got.slice(0, 5));
          setAt(-1);
        }
      } catch {
        if (mine === asked.current) setHits([]);
      }
    }, 150);
    return () => clearTimeout(wait);
  }, [typed]);

  const open = (h: Hit) => {
    setTyped("");
    setHits(null);
    router.push(h.href);
  };

  return (
    <div role="search" aria-label="Find a child or paper" className="relative min-w-0 max-[700px]:flex-1 max-[700px]:basis-0 min-[701px]:shrink-0">
      <label className="sr-only" htmlFor="bar-search">
        Search
      </label>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-muted)]">
        <Icon name="search" size={16} />
      </span>
      <input
        id="bar-search"
        name="q"
        type="search"
        role="combobox"
        aria-expanded={hits !== null}
        aria-controls={list}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Find a child or paper"
        value={typed}
        onChange={(e) => setTyped(e.target.value.slice(0, 80))}
        onKeyDown={(e) => {
          const n = hits?.length ?? 0;
          if (e.key === "ArrowDown" && n) {
            e.preventDefault();
            setAt((at + 1) % n);
          } else if (e.key === "ArrowUp" && n) {
            e.preventDefault();
            setAt((at - 1 + n) % n);
          } else if (e.key === "Enter" && hits?.length) {
            e.preventDefault();
            open(hits[Math.max(at, 0)]);
          } else if (e.key === "Escape") setHits(null);
        }}
        className="min-h-[var(--tap)] w-full rounded-[var(--radius-control)] border border-[var(--line-control)] bg-[var(--panel)] pr-[var(--space-2)] pl-9 text-[length:var(--text-body)] text-[var(--ink)] min-[701px]:w-[240px] min-[701px]:focus:w-[340px]"
      />
      {hits !== null ? (
        <div id={list} className="absolute top-full right-0 left-0 z-40 mt-1 rounded-[var(--radius-card)] bg-[var(--panel)] p-[var(--space-1)] text-[var(--ink)] shadow-[var(--shadow-card)] min-[701px]:w-[420px] min-[701px]:left-auto">
          {hits.length ? (
            <ul aria-label="Found" role="listbox">
              {hits.map((h, i) => (
                <li key={h.href} role="option" aria-selected={i === at}>
                  <a
                    href={h.href}
                    onClick={(e) => {
                      e.preventDefault();
                      open(h);
                    }}
                    className={`block min-h-[var(--tap)] rounded-[var(--radius-control)] px-[var(--space-2)] py-[10px] text-[length:var(--text-label)] no-underline ${i === at ? "bg-[var(--highlight)]" : "hover:bg-[var(--surface)]"}`}
                  >
                    {h.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="px-[var(--space-2)] py-[var(--space-2)] text-[length:var(--text-label)]">
              Nothing found: try part of a name, a Sr. No., a skill or a paper code.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
