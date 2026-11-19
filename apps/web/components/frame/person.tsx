"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/link";
import { Icon } from "@/lib/icons";
import { setActingAs } from "@/lib/acting-as";
import { SETUP_LINKS } from "@/lib/menu";

// The person's menu, at the right of the bar (CP-66): one button at every width, and behind it the account, Acting as, Setup and its four
// pages, help and sign out. It closes on Escape, on a click outside it, and when the page changes.
export function Person({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // a page change closes the menu (a link inside it was followed): kept as the path it was opened on
  const path = usePathname();
  const [at, setAt] = useState(path);
  if (at !== path) {
    setAt(path);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative flex items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="person-menu"
        aria-label={`${name}: account`}
        onClick={() => setOpen(!open)}
        className="flex min-h-[var(--tap)] min-w-[var(--tap)] cursor-pointer items-center justify-center gap-[var(--space-1)] rounded-[var(--radius-control)] px-[var(--space-1)] text-[var(--bar-ink)] hover:bg-[var(--bar-hover)] focus-visible:outline-[var(--bar-ink)]"
      >
        <Icon name="educator" size={22} />
        <Icon name="chevron-down" size={16} />
      </button>
      <div
        id="person-menu"
        data-person-menu
        className={`absolute top-full right-0 z-40 mt-[var(--space-1)] min-w-60 flex-col items-stretch gap-[var(--space-0)] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] p-[var(--space-2)] text-[length:var(--text-label)] text-[var(--ink)] shadow-[var(--shadow-pop)] ${open ? "flex" : "hidden"}`}
      >
        {children}
      </div>
    </div>
  );
}

/** Money, in the person's menu on a phone: the tab bar holds five lines at most, so the sixth waits here, as Setup does (the desktop bar lists it itself). */
export function MoneyLink() {
  return (
    <nav aria-label="Money" data-money-link className="min-[901px]:hidden">
      <Link href="/money" className="flex min-h-[var(--tap)] items-center rounded-[var(--radius-control)] px-[var(--space-2)] text-[var(--ink)] no-underline hover:bg-[var(--surface)]">
        Money
      </Link>
    </nav>
  );
}

/** Setup and its four pages (lib/menu.ts SETUP_LINKS), a group in the person's menu. */
export function SetupLinks() {
  return (
    <nav aria-label="Setup" data-setup-links className="my-[var(--space-1)] border-y border-[var(--line)] py-[var(--space-1)]">
      <ul className="grid">
        {SETUP_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex min-h-[var(--tap)] items-center rounded-[var(--radius-control)] px-[var(--space-2)] text-[var(--ink)] no-underline hover:bg-[var(--surface)]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function AccountLink({ name, classes }: { name: string; classes: string }) {
  return (
    <Link href="/login?view=forgot" title={`${classes}. Get a link to change your password`} data-testid="who" className="inline-flex min-h-[var(--tap)] items-center rounded-[var(--radius-control)] px-[var(--space-2)] hover:bg-[var(--surface)] gap-[var(--space-1)] whitespace-nowrap text-[var(--ink)] no-underline">
      <Icon name="educator" size={20} />
      <span className="truncate">{name}</span>
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
      <span className="font-semibold">{on ? "educator" : "yourself"}</span>
    </button>
  );
}
