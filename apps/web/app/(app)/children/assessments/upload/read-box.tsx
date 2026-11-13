import { Notice } from "@/components/parts";
import { readScan } from "./actions";
import { UploadScans } from "./upload-scans";

// Upload papers, inside the assessment they belong to (page charter B6; the Upload papers page is retired): one drop zone and the Google
// Drive link, the same server actions and engine calls the old page used (N8, `POST /read/upload` and `POST /read/file`). What the engine
// said about the last file is one line above it. `from` is the address to come back to: the board with this assessment's Upload tab open,
// or the assessment's own page. The engine sorts every page by the code printed on it, so a file holding other papers is read whole.
/** What the engine said about the last file sent, read again or a page given (the upload actions' `read=`), as one notice; none when the
 *  address carries none. The Upload tab, the assessment's page and the Reading view each show it where the action came back to. */
export function ReadSaid({ read, why, pages }: { read?: string; why?: string; pages?: string }) {
  const n = Number(pages) || "";
  const said = {
    started: `Reading ${n} pages. They appear on the board as they are read — a minute or two.`,
    refused: `The engine would not take that: ${why ?? ""}`,
    "not-a-link": "Paste the link to the scan on Google Drive (drive.google.com/…).",
    engine: "The engine is not answering; nothing was read.",
    given: `Page ${n} is being read now as the paper of the child you gave it to.`,
    again: `Reading ${n} pages again. Answers a person has checked stay as they left them.`,
  }[read ?? ""];
  return said ? <Notice tone={read === "started" || read === "given" || read === "again" ? "neem" : "terracotta"}>{said}</Notice> : null;
}

export function ReadBox({ read, why, pages, reading, from }: { read?: string; why?: string; pages?: string; reading: boolean; from: string }) {
  return (
    <section id="read-scan" aria-label="Upload papers" className="flex min-w-0 flex-col gap-2" data-upload-box>
      <ReadSaid read={read} why={why} pages={pages} />
      <UploadScans reading={reading} />
      <form action={readScan} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="from" value={from} />
        <input
          type="url"
          name="url"
          required
          placeholder="Or a Google Drive link: https://drive.google.com/file/d/…"
          aria-label="Link to the scan on Google Drive"
          className="min-w-0 flex-1 rounded border border-line bg-chalk px-3 py-2 text-[14px]"
        />
        <button type="submit" className="btn secondary">
          Read it
        </button>
      </form>
    </section>
  );
}
