import Link from "@/components/link";
import type { PaperListRow } from "@/lib/queries-papers";
import { paperHref } from "@/lib/assessment-ui";

/** A copy's score once it is checked: right of scored. */
export const isScored = (p: PaperListRow) => (p.stage === "checked" || p.stage === "signed off") && !!p.scored;

/** The score, and under it a plain question when nothing is right: a paper with every answer blank or none right is probably the
 *  wrong page (goals/dup_answers_listed_twice.yaml). */
export function Score({ p }: { p: PaperListRow }) {
  if (!isScored(p)) return null;
  return (
    <>
      {p.right} of {p.scored}
      {!p.right ? (
        <span data-warn className="block text-[11.5px]">
          {p.blank === p.scored ? "every answer blank" : "none right"}: is this the right page?
        </span>
      ) : null}
    </>
  );
}

/** Copies of a child who has already handed theirs in, never read: said in words under the table, each a way to its paper, not listed as a second child. */
export function ExtraCopies({ extras, keyOf }: { extras: PaperListRow[]; keyOf: string }) {
  if (!extras.length) return null;
  const many = extras.length !== 1;
  return (
    <p data-extras className="b-caption mt-2">
      {extras.length} extra {many ? "copies" : "copy"} of {many ? "children" : "a child"} who {many ? "have" : "has"} already handed theirs in, not read:{" "}
      {extras.map((p, i) => (
        <span key={p.id}>
          {p.roll_no ? <Link href={paperHref(keyOf, p.roll_no)}>{p.qr}</Link> : p.qr}
          {i < extras.length - 1 ? ", " : ""}
        </span>
      ))}
    </p>
  );
}
