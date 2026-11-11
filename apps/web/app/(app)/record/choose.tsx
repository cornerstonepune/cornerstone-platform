"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { PhotoRule } from "@/components/capture-bar";
import { ICON_SIZE, Icon } from "@/lib/icons";
import { photoTarget, startTyped } from "../notes/actions";

/** Which period: the lessons of today, chosen in the address (`?session=`), so the page and the rail follow it. */
export function PeriodField({ options, chosen, classId }: { options: { id: string; label: string }[]; chosen?: string; classId: string }) {
  const router = useRouter();
  return (
    <label className="grid gap-1 text-[14px]">
      Which period
      <select
        className="select max-w-md"
        value={chosen ?? ""}
        onChange={(e) => router.replace(e.target.value ? `/record?class=${classId}&session=${e.target.value}` : `/record?class=${classId}`)}
      >
        <option value="">Not about one period</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Type the marks: the empty note for this class (and period), opened on the confirm screen. `main` when the microphone is not an option. */
export function TypeMarks({ classId, sessionId, main }: { classId: string; sessionId?: string; main?: boolean }) {
  const [said, setSaid] = useState<string | null>(null);
  const [pending, go] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={main ? "btn !min-h-14 w-full justify-center" : "btn secondary !min-h-14 w-full justify-center min-[700px]:w-auto"}
        data-typed
        onClick={() =>
          go(async () => {
            const out = await startTyped(classId, sessionId);
            if (out?.error) setSaid(out.error);
          })
        }
      >
        Type the marks
      </button>
      {said ? <p role="alert" className="text-[14px] text-terracotta">{said}</p> : null}
    </>
  );
}

/** Add a photo of the lesson's work or board: jpg, png or heic, sent straight to the engine. Needs a period chosen: a photo hangs on the
 *  lesson's note, never on a child. */
export function AddPhoto({ classId, sessionId }: { classId: string; sessionId?: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const [pending, go] = useTransition();
  // the picker works once the page has hydrated: a file chosen before then would be dropped without a word
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const send = (file: File) =>
    go(async () => {
      setSaid(null);
      if (!sessionId) return setSaid("Choose the period first: a photo belongs to a lesson.");
      const to = await photoTarget(classId, sessionId);
      if ("error" in to) return setSaid(to.error);
      const body = new FormData();
      body.append("file", file, file.name);
      body.append("note_id", to.noteId);
      const res = await fetch(to.url, { method: "POST", headers: { "X-Upload-Token": to.token }, body }).catch(() => null);
      if (!res?.ok) {
        const why = (await res?.json().catch(() => null)) as { detail?: string } | null;
        return setSaid(typeof why?.detail === "string" ? why.detail : "Not sent. Try again.");
      }
      setSaid("Photo added to this lesson's note.");
    });
  return (
    <div className="grid gap-2" data-add-photo data-ready={ready ? "" : undefined}>
      <label className="btn secondary !min-h-14 w-full cursor-pointer justify-center gap-2 min-[700px]:w-auto">
        <Icon name="photo" size={ICON_SIZE.row} />
        Add a photo
        <input type="file" accept="image/jpeg,image/png,image/heic" className="sr-only" disabled={pending || !ready} onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
      </label>
      <PhotoRule />
      {said ? <p role="status" className="text-[14px]">{said}</p> : null}
    </div>
  );
}
