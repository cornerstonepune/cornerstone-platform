import { held, type CaptureAnswer } from "./queries-read";

// What the engine did with this answer, said as a sentence rather than a state name. A teacher
// should never have to learn the word `illegible` to use this screen.
export function reading(a: CaptureAnswer): string {
  if (a.human_read !== null) return `You said the child wrote ${a.human_read || "nothing"}.`;
  const reason = a.why ?? "";
  // ADR 0032: a right answer waits until the reader has earned trust on this kind of question; a
  // reading the child's own notebook doubts says why; the second reader's guess says who made it.
  if (reason.includes("until the reader is trusted"))
    return `The reader read ${a.read} and marks it right. This kind of question is not yet trusted (${reason.match(/\(([^)]*)\)$/)?.[1] ?? "not enough checks yet"}), so a person confirms it.`;
  // ADR 0091: the two readers disagree, and both readings are shown; the person says which, or what else, it is.
  if (a.second_read !== null)
    return `Two readers disagree. The reader reads ${a.guess}; the second reader, shown the child's own answers, reads ${a.second_read || "nothing"}. Look at the photograph and say what the child wrote.`;
  if (reason.startsWith("this child's")) return `The reader read ${a.guess}, but ${reason}.`;
  if (a.guess && a.guess_by)
    return `The reader could not settle this (${reason}). The second reader, shown ${a.guess_by.match(/with (\d+)/)?.[1] ?? "some"} of the child's own answers, reads it as ${a.guess}.`;
  if (held(a))
    return a.answer_state === "blank"
      ? "The reader found nothing written here. Every blank is checked by a person before it counts."
      : `The reader read ${a.read}, a wrong answer. Every wrong answer is checked by a person before it counts.`;
  // No percentage. The engine only stands behind a reading it is sure enough of; printing "82% sure"
  // beside it turned every settled answer into a question for the teacher.
  if (a.answer_state === "written") return `The reader read ${a.read}.`;
  if (a.answer_state === "blank") return "The reader found nothing written here.";
  if (a.answer_state === "not_found") return "The reader could not find this question on the photograph.";
  // A tick or a sentence is never handed to the digit reader: it is the educator's to read, not a failure.
  if (a.answer_state === "for_a_person") return "The reader does not read ticks or sentences. Look at the photograph and say what the child ticked or wrote.";
  // The reader knows WHICH of five things went wrong, and saying so turns "your problem now" into
  // a question the teacher can answer at a glance: an answer under the floor she confirms or
  // corrects, a region holding four numbers for two answers she has to split herself.
  const why = a.why ? ` (${a.why})` : "";
  return `There is writing here that the reader could not make out.${why}`;
}
