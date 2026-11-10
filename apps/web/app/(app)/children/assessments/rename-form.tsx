import { renameThisAssessment } from "./[key]/actions";

/** Name an assessment: one field and a button, the educator's own words over the built name. `back` is the address to return to. */
export function RenameForm({ assessmentKey, name, back }: { assessmentKey: string; name: string; back: string }) {
  return (
    <form action={renameThisAssessment} className="mt-1 flex flex-wrap gap-1" data-rename="">
      <input type="hidden" name="key" value={assessmentKey} />
      <input type="hidden" name="back" value={back} />
      <input name="name" defaultValue={name} maxLength={120} aria-label="Name this assessment" className="input min-w-0 flex-1 !py-1 !text-[13px]" />
      <button type="submit" className="btn secondary !px-2 !py-1 !text-[12px]">
        Save the name
      </button>
    </form>
  );
}
