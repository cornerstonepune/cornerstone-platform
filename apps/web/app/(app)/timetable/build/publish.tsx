"use client";

import { useState } from "react";
import Link from "@/components/link";
import { fortnightWords, type Pattern } from "@/lib/timetable-build";
import { suggestObjectives } from "../picker-actions";
import { publishPattern } from "./actions";

// Publish (CP-71, Done when 8): the page's one main action. The class's pattern is written as the next fortnight's lessons. It is asked
// twice: the first press only counts ("60 lessons, none on 1 holiday"), the second writes. While a Must problem is open the button is
// off and says why beside it; any other refusal is the engine's own sentence. With the second press she may also ask for suggestions
// (CP-74): the next objectives, machine-made, on the new lessons of subjects whose order is checked; a person can change any of them.
type Next = NonNullable<Pattern["next_fortnight"]>;
type Stage = { at: "rest" } | { at: "asking" } | { at: "sure"; written: number; holidays: number } | { at: "done"; written: number };

export function Publish({ classId, next, must, busy, onSaid, onDone }: { classId: string; next: Next | null; must: number; busy: boolean; onSaid: (words: string) => void; onDone: () => void }) {
  const [stage, setStage] = useState<Stage>({ at: "rest" });
  const [suggest, setSuggest] = useState(true);
  if (!next) return <span className="bd-publish-none b-muted">Every fortnight of this year is published.</span>;
  const name = `Fortnight ${next.number}`;
  const go = async (dry: boolean) => {
    setStage({ at: "asking" });
    const o = await publishPattern(classId, next.number, dry);
    if (!o.ok) {
      setStage({ at: "rest" });
      onSaid(o.why);
      return;
    }
    if (dry) return setStage({ at: "sure", written: o.written, holidays: o.holidays.length });
    setStage({ at: "done", written: o.written });
    const made = suggest ? await suggestObjectives() : null;
    const more = !made ? "" : made.ok ? (made.data.written ? ` ${made.data.written} ${made.data.written === 1 ? "lesson was" : "lessons were"} given a suggested objective.` : " No lesson needed a suggested objective.") : ` The suggestions were not made: ${made.why}`;
    onSaid(`Published ${name}: ${o.written} lessons.${more}`);
    onDone();
  };
  if (stage.at === "done")
    return (
      <span className="bd-publish" data-published>
        <span>
          {name} is published: {stage.written} lessons.
        </span>
        <Link href="/timetable" className="btn secondary">
          See the timetable
        </Link>
      </span>
    );
  if (stage.at === "sure")
    return (
      <span className="bd-publish" role="group" aria-label={`Publish ${name}`} data-publish-sure>
        <span>
          {fortnightWords(next)} gets {stage.written} lessons{stage.holidays ? `, none on ${stage.holidays} ${stage.holidays === 1 ? "holiday" : "holidays"}` : ""}.
        </span>
        <label className="bd-suggest">
          <input type="checkbox" checked={suggest} onChange={(e) => setSuggest(e.target.checked)} data-publish-suggest />
          Suggest objectives for subjects whose order is checked
        </label>
        <button type="button" className="btn" data-ux="action" onClick={() => void go(false)} data-publish-yes>
          Publish
        </button>
        <button type="button" className="btn tertiary" onClick={() => setStage({ at: "rest" })}>
          Not yet
        </button>
      </span>
    );
  const off = must > 0;
  return (
    <span className="bd-publish">
      {off ? (
        <span id="bd-publish-why" className="bd-publish-why" data-publish-why>
          {must} to fix before publishing
        </span>
      ) : null}
      <button type="button" className="btn" data-ux="action" disabled={off || busy || stage.at === "asking"} aria-describedby={off ? "bd-publish-why" : undefined} onClick={() => void go(true)} data-publish>
        Publish {name}
      </button>
    </span>
  );
}
