import { Icon, ICON_SIZE } from "@/lib/icons";

const WAYS = [
  ["class", "For a class", "class"],
  ["each", "For each child", "class"],
  ["one", "For one child", "child"],
  ["sheet", "A ready-made worksheet", "form"],
] as const;

/** The board's one primary action (page charter B6): Make an assessment, a button under the title that opens the four ways in. Each opens
 *  the maker for that way, on this screen; the assessment it makes starts in the first lane, To approve and print. */
export function MakeCard() {
  return (
    <details data-make className="relative">
      <summary className="btn inline-flex cursor-pointer list-none items-center gap-2" data-make-open>
        <Icon name="assessment" size={ICON_SIZE.row} />
        Make an assessment
      </summary>
      <section aria-label="Make an assessment" className="b-card mt-2" data-kind="assessment">
        <form method="get" action="/children/assessments" className="flex flex-wrap items-center gap-2">
          {WAYS.map(([v, words, icon]) => (
            <button key={v} type="submit" name="make" value={v} className="b-btn">
              <Icon name={icon} size={ICON_SIZE.row} />
              {words}
            </button>
          ))}
        </form>
      </section>
    </details>
  );
}
