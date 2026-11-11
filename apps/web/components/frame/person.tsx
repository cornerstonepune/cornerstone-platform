"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "@/components/link";
import { Icon } from "@/lib/icons";
import { setActingAs } from "@/lib/acting-as";

// The person, at the right of the bar. From 701 px wide its parts sit along the bar; on a phone they fold into one button
// (the bar keeps the mark, the search and the person, and the rest wait behind that button).
export function Person({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="person-menu"
        aria-label={`${name}: account`}
        onClick={() => setOpen(!open)}
        className="flex min-h-[var(--tap)] min-w-[var(--tap)] cursor-pointer items-center justify-center rounded-[var(--radius-control)] text-[var(--ink)] min-[701px]:hidden"
      >
        <Icon name="educator" size={24} />
      </button>
      <div
        id="person-menu"
        className={`items-center gap-[var(--space-2)] text-[length:var(--text-label)] max-[700px]:absolute max-[700px]:top-full max-[700px]:right-0 max-[700px]:z-40 max-[700px]:min-w-[220px] max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:rounded-[var(--radius-card)] max-[700px]:bg-[var(--panel)] max-[700px]:p-[var(--space-2)] max-[700px]:shadow-[var(--shadow-card)] ${open ? "flex" : "max-[700px]:hidden min-[701px]:flex"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function AccountLink({ name, classes }: { name: string; classes: string }) {
  return (
    <Link href="/login?view=forgot" title={`${classes}. Get a link to change your password`} data-testid="who" className="inline-flex min-h-[var(--tap)] max-w-[160px] items-center gap-[var(--space-1)] whitespace-nowrap truncate text-[var(--ink)] no-underline">
      <span className="min-[1400px]:hidden max-[700px]:hidden">
        <Icon name="educator" size={20} />
      </span>
      <span className="max-[1399px]:sr-only max-[700px]:not-sr-only">{name}</span>
    </Link>
  );
}

/** The two-state switch: spoken (aria-checked) and shown as a word, never colour alone. */
export function ActingAsSwitch({ on }: { on: boolean }) {
  const [busy, go] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => go(() => setActingAs(!on))}
      className="inline-flex min-h-[var(--tap)] cursor-pointer items-center gap-[var(--space-1)] whitespace-nowrap rounded-[var(--radius-control)] px-[var(--space-2)] text-[var(--ink)] hover:bg-[var(--surface)]"
    >
      <Icon name="acting-as" size={20} />
      <span>Acting as</span>
      <span className="font-medium">{on ? "educator" : "yourself"}</span>
    </button>
  );
}
