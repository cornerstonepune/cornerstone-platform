"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";

// A claim's bill as a picture (CP-80): the engine's own photo, through the site's `/money/bill/<id>` (which asks the engine whether this person may see
// it). A bill that is a PDF, or cannot be shown, is a quiet box that says so; the link beside it opens the file itself. `small`: the row's thumbnail.
export function BillPicture({ id, has, small }: { id: string; has: boolean; small?: boolean }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // an image that failed before this page woke up never told React: look at it once
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setBroken(true);
  }, []);
  const box = small ? "size-14 shrink-0" : "min-h-32 w-full";
  const none = has && broken ? "The bill cannot be shown here. Open it to read it." : "No bill yet";
  if (!has || broken)
    return (
      <span data-bill={has ? "file" : "none"} className={`${box} flex flex-col items-center justify-center gap-[var(--space-0)] rounded-[var(--radius-control)] bg-[var(--surface)] p-[var(--space-0)] text-center text-[length:var(--text-label)] text-[var(--ink-muted)]`}>
        <Icon name="note" size={small ? 20 : 24} />
        {small ? null : none}
      </span>
    );
  return (
    <img
      ref={img}
      src={`/money/bill/${id}`}
      alt={small ? "" : "The bill, as it was photographed"}
      loading={small ? "lazy" : "eager"}
      decoding="async"
      onError={() => setBroken(true)}
      data-bill="picture"
      className={small ? "size-14 shrink-0 rounded-[var(--radius-control)] bg-[var(--surface)] object-cover" : "max-h-screen w-full rounded-[var(--radius-control)] bg-[var(--surface)] object-contain"}
    />
  );
}
