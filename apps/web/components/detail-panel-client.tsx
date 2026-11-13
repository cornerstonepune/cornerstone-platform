"use client";

import { Children, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// The DetailPanel's behaviour (components/detail-panel.tsx): it takes focus when it opens (its title), Escape or the × closes it and focus
// goes back to the thing that opened it, and its tabs are a WAI-ARIA tab list (arrow keys, Home, End; one tab stop). The tab chosen is kept
// in the address (`tab=`) without a reload, so a link or a reload opens the same tab.
const RETURN = "cs.panel-return";

const remember = (key: string) => {
  try {
    sessionStorage.setItem(RETURN, key);
  } catch {
    // storage refused (a private window): focus then starts at the top of the page, as after any page change
  }
};

/** A key the person is typing into (a field, a list, the lesson form's picker) is theirs, not the panel's. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (!!t.closest("input, select, textarea, [data-picker]") || t.isContentEditable);

export function PanelShell({ openKey, closeHref, inline, children }: { openKey: string; closeHref?: string; inline?: boolean; children: ReactNode }) {
  const router = useRouter();
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!inline) box.current?.querySelector<HTMLElement>("[data-panel-title]")?.focus({ preventScroll: window.matchMedia("(min-width: 1000px)").matches });
  }, [openKey, inline]);
  useEffect(() => {
    if (inline || !closeHref) return;
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || typing(e.target) || document.querySelector("dialog[open]")) return;
      remember(openKey);
      router.replace(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [openKey, closeHref, router, inline]);
  return (
    <aside
      ref={box}
      id={inline ? undefined : "detail-panel"}
      data-inline={inline ? "" : undefined}
      data-block="DetailPanel"
      data-panel="open"
      data-open={openKey}
      aria-labelledby="panel-h"
      className="b-dpanel"
      onClickCapture={(e) => {
        if ((e.target as Element).closest("[data-panel-close]")) remember(openKey);
      }}
    >
      {children}
    </aside>
  );
}

/** Drawn with the summary (nothing open): the thing a closed panel had open takes the focus back. */
export function PanelReturn() {
  useEffect(() => {
    let key: string | null = null;
    try {
      key = sessionStorage.getItem(RETURN);
      sessionStorage.removeItem(RETURN);
    } catch {
      return;
    }
    if (key) document.querySelector<HTMLElement>(`[data-open-key="${CSS.escape(key)}"]`)?.focus();
  }, []);
  return null;
}

export function PanelTabs({ tabs, initial, children }: { tabs: readonly { key: string; label: string }[]; initial?: string; children: ReactNode }) {
  const id = useId();
  const [on, setOn] = useState(initial ?? tabs[0]?.key);
  const list = useRef<HTMLDivElement>(null);
  const choose = (key: string, focus = false) => {
    setOn(key);
    const url = new URL(location.href);
    url.searchParams.set("tab", key);
    history.replaceState(history.state, "", url);
    if (focus) list.current?.querySelector<HTMLElement>(`[data-tab="${key}"]`)?.focus();
  };
  const keys = (e: KeyboardEvent) => {
    const at = tabs.findIndex((t) => t.key === on);
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    choose(tabs[(to + tabs.length) % tabs.length].key, true);
  };
  const bodies = Children.toArray(children);
  return (
    <>
      <div ref={list} role="tablist" aria-label="Details" className="b-tabs" onKeyDown={keys}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${id}-tab-${t.key}`}
            data-tab={t.key}
            aria-selected={t.key === on}
            aria-controls={`${id}-panel-${t.key}`}
            tabIndex={t.key === on ? 0 : -1}
            onClick={() => choose(t.key)}
            className="b-tab"
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" id={`${id}-panel-${t.key}`} aria-labelledby={`${id}-tab-${t.key}`} hidden={t.key !== on} tabIndex={0} className="b-tabpanel">
          {bodies[i]}
        </div>
      ))}
    </>
  );
}
