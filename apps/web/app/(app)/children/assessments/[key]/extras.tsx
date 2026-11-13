import Link from "@/components/link";
import { DataTable } from "@/components/data-table";
import { StatusChip } from "@/components/status-chip";
import { assessmentHref } from "@/lib/assessment-ui";
import type { PaperListRow } from "@/lib/queries-papers";
import { ExtraCopies } from "./score";

type NoPaper = { roll: string; why: string };
type Spare = { difficulty: string | null; qr_code: string; print_status: string };
type Retake = { qr: string; roll_no: string | null; retake: string[] };

/** The copies beside the children's own on the assessment's Copies tab (full page): the children with no paper and why, the extra copies,
 *  the spares with no name on them, and the pages to photograph again. */
export function Extras({ key_: key, classId, noPaper, extras, spares, retake }: { key_: string; classId: string | undefined; noPaper: readonly NoPaper[]; extras: PaperListRow[]; spares: readonly Spare[]; retake: readonly Retake[] }) {
  return (
    <>
      {noPaper.length ? (
        <section aria-label="Children with no paper" data-no-paper>
          <h2 className="mb-2">Children with no paper <span className="b-muted">{noPaper.length}</span></h2>
          <DataTable
            label="Children with no paper"
            columns={[
              // the row opens the child, where a paper of her own is made: a row of this table is never a dead end
              { key: "roll", label: "Sr. No.", num: true, width: "6rem", value: (r: NoPaper) => r.roll, cell: (r: NoPaper) => (classId && r.roll ? <Link href={`/children/${classId}/${encodeURIComponent(r.roll)}`}>{r.roll}</Link> : r.roll) },
              { key: "why", label: "Why", value: (r: NoPaper) => r.why },
              { key: "state", label: "State", status: true, width: "10rem", value: () => "No paper", cell: () => <StatusChip state="noPaper" words="No paper" /> },
            ]}
            rows={noPaper}
            rowKey={(r) => r.roll}
            more={{ page: 1, href: () => assessmentHref(key) }}
          />
        </section>
      ) : null}
      <ExtraCopies extras={extras} keyOf={key} />
      {spares.length ? (
        <section aria-label="Spare copies" data-spares>
          <h2 className="mb-2">Spare copies <span className="b-muted">{spares.length}</span></h2>
          <p className="b-caption">Extra papers with no name on them, for a spoilt page or a child who arrives late.</p>
          <DataTable
            label="Spare copies"
            columns={[
              { key: "level", label: "Level", width: "10rem", value: (r: Spare) => r.difficulty },
              { key: "paper", label: "Paper", value: (r: Spare) => r.qr_code, cell: (r: Spare) => <Link href={`/worksheets/${r.qr_code}`}>{r.qr_code}</Link> },
              { key: "state", label: "State", status: true, width: "10rem", value: (r: Spare) => r.print_status, cell: (r: Spare) => <StatusChip state={r.print_status === "new" ? "toApprove" : "done"} words={r.print_status === "new" ? "To approve" : "Printed"} /> },
            ]}
            rows={spares}
            rowKey={(r) => r.qr_code}
            more={{ page: 1, href: () => assessmentHref(key) }}
          />
        </section>
      ) : null}
      {retake.length ? (
        <div role="alert" aria-label="To photograph again" className="p-3">
          <p className="font-semibold">To photograph again</p>
          <ul className="ml-5 list-disc">
            {retake.map((c) => (
              <li key={c.qr}>
                {c.roll_no ? `Roll ${c.roll_no}` : c.qr}: {c.retake.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
