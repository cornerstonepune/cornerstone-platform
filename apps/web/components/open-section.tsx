"use client";

import { useEffect } from "react";

// The help's "?" lands on /guide#<screen>: the section of that screen opens, on arriving and when the address changes.
export function OpenSection() {
  useEffect(() => {
    const open = () => {
      const at = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (at instanceof HTMLDetailsElement) {
        at.open = true;
        at.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
