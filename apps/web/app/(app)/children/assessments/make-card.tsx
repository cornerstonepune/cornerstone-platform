import { Icon, ICON_SIZE } from "@/lib/icons";

const WAYS = [
  ["class", "For a class", "class"],
  ["each", "For each child", "class"],
  ["one", "For one child", "child"],
  ["sheet", "A ready-made worksheet", "form"],
] as const;

/** Make an assessment: four ways in. Each opens the maker for that way, on this screen. */
export function MakeCard({ main = false }: { main?: boolean }) {
  return (
    <section aria-label="Make an assessment" className="b-card" data-kind="assessment">
      <h2 className="b-card-h">Make an assessment</h2>
      <form method="get" action="/children/assessments" className="flex flex-wrap items-center gap-2">
        <span className="b-muted w-full">It starts at Created and opens so you can see it.</span>
        {WAYS.map(([v, words, icon], i) => (
          <button key={v} type="submit" name="make" value={v} className="b-btn" data-ux={main && i === 0 ? "action" : undefined}>
            <Icon name={icon} size={ICON_SIZE.row} />
            {words}
          </button>
        ))}
      </form>
    </section>
  );
}
