"use client";

import { useState, type ReactNode } from "react";

// The tabs of a detail panel. Every tab's body is on the page from the start (hidden until chosen), so a form in one tab keeps what was
// typed while another tab is read. Arrow keys move between tabs.
export type PanelTab = { key: string; label: string; body: ReactNode };

export function PanelTabs({ tabs, first }: { tabs: readonly PanelTab[]; first?: string }) {
  const [on, setOn] = useState(first && tabs.some((t) => t.key === first) ? first : tabs[0]?.key);
  const move = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setOn(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  };
  return (
    <div data-panel-tabs>
      <div role="tablist" aria-label="Detail" className="b-ptabs">
        {tabs.map((t, i) => (
          <button key={t.key} id={`tab-${t.key}`} role="tab" type="button" aria-selected={on === t.key} aria-controls={`panel-${t.key}`} tabIndex={on === t.key ? 0 : -1} onClick={() => setOn(t.key)} onKeyDown={(e) => move(e, i)} className="b-ptab">
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} id={`panel-${t.key}`} role="tabpanel" aria-labelledby={`tab-${t.key}`} hidden={on !== t.key} className="b-pbody">
          {t.body}
        </div>
      ))}
    </div>
  );
}
