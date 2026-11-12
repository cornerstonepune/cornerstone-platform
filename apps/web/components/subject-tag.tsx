import { Icon, ICON_SIZE } from "@/lib/icons";
import { subjectLook, subjectLooks } from "@/lib/timetable-ui";

// A subject in its colour, from the subject rows (config `timetable.subject_looks`), for any block that names a lesson, an activity or a
// bar (docs/frontend/page-charter.md A3). `code` is the engine's subject code; one with no row is drawn as the fallback look, so nothing
// here names a subject.
const WORDS = { numeracy: "Numeracy", language: "Language", arts: "Arts" } as const;

export async function SubjectTag({ code, words }: { code: string | null; words?: string }) {
  const look = subjectLook(await subjectLooks(), code);
  return (
    <span data-block="SubjectTag" data-subject={look} className="b-subj">
      <Icon name={look} size={ICON_SIZE.table} />
      {words ?? WORDS[look]}
    </span>
  );
}
