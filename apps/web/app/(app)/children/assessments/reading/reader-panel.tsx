// How the reader is doing (goals/u3-marking.yaml), on the Assessments board's Reading view: the reader's record in every class, and the
// table of it by day, by kind of question or by how sure. The counts are the engine's; nothing here decides one.
import { Panel } from "@/components/parts";
import { questionKinds } from "@/lib/question-types";
import type { ReaderReport } from "@/lib/queries-read";
import { ReaderTable, type ReaderView } from "./reader-table";
import { dateWords as fmtDate } from "@/lib/week";

// It is the reader's record, in every class: its trust in a kind of question is earned across the school (`kind_trust`),
// so it is never narrowed to a person's classes, and it says so beside their own counts (goals/ux8a-numbers-true.yaml).
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");

export async function ReaderPanel({ r, view, page, keep, base }: { r: ReaderReport; view: ReaderView; page: number; keep: Record<string, string | undefined>; base?: string }) {
  const { words } = await questionKinds();
  const read = r.days.filter((d) => d.stood_behind > 0); // newest first
  const [latest, first] = [read[0], read[read.length - 1]];
  return (
    <Panel title="How the reader is doing" label="How the reader is doing" aside={`from ${r.checked} answers checked, in every class`}>
      <p className="text-[15px] leading-snug">
        In every class, people have checked {r.checked} answers the reader read. The reader was right on {r.right} of the {r.stood_behind} it stood behind ({pct(r.right, r.stood_behind)}),
        wrong on {r.stood_behind - r.right}, and gave up on {r.gave_up}{r.gave_up ? ` (its guess was right on ${r.guess_right})` : ""}.
        {first && latest && first !== latest
          ? ` On the first papers it read (${fmtDate(first.day)}) it was right on ${pct(first.right, first.stood_behind)}; on the latest (${fmtDate(latest.day)}), ${pct(latest.right, latest.stood_behind)}.`
          : ""}{" "}
        Every check you make teaches it how that child writes; a kind of question is settled by the reader alone only once it has matched you{" "}
        {Math.round(r.bar * 100)}% of the time over the last {r.window} checks. By kind of question says how many more right checks each still needs.
      </p>
      {r.days.length || r.kinds.length || r.bands.length ? <ReaderTable r={r} words={words} view={view} page={page} keep={keep} base={base} /> : null}
    </Panel>
  );
}
