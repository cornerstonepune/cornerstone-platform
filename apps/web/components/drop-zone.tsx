"use client";

import { useState } from "react";
import { ICON_SIZE, Icon } from "@/lib/icons";

/** Choose scans or drop them; or a Drive link. Accepts the stated kinds; a wrong kind shows a message, a right one shows
 *  its name before anything is sent. */
export function DropZone({ accept = ["application/pdf", "image/"], kinds = "a PDF or a picture" }: { accept?: string[]; kinds?: string }) {
  const [names, setNames] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string | null>(null);
  const take = (files: FileList | null) => {
    const all = [...(files ?? [])];
    const bad = all.find((f) => !accept.some((a) => f.type.startsWith(a)));
    setWrong(bad ? `${bad.name} is not ${kinds}.` : null);
    setNames(bad ? [] : all.map((f) => f.name));
  };
  return (
    <label data-block="DropZone" className="b-drop">
      <Icon name="upload" size={ICON_SIZE.heading} />
      <span>Choose scans or drop them here, or paste a Drive link</span>
      <input type="file" accept={accept.map((a) => (a.endsWith("/") ? `${a}*` : a)).join(",")} multiple onChange={(e) => take(e.target.files)} />
      {names.length ? <span data-files>{names.join(", ")}</span> : null}
      {wrong ? <span role="alert" data-error>{wrong}</span> : null}
    </label>
  );
}
