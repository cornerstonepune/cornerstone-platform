import { Card } from "@/components/cards";
import { Screen } from "@/components/app-frame";
import { Icon } from "@/lib/icons";
import { requireStaff } from "@/lib/auth";
import { EngineDown } from "@/lib/engine";
import { type Change, type RulesView, dayWords, rulesOf } from "@/lib/money-rules";
import { RulesForm } from "./rules-form";
import "./rules.css";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// The money rules (CP-80, docs: specs/CP-80/spec.md): the limits, who approves and who pays each kind of claim, where the operations lead sits and what a
// claim can be for, in sentences. A co-founder changes them here and Save the rules sends the draft to the engine, whose own words say why it refuses.
// Anyone else reads the same sentences. Below, every change in words. Nothing is decided on this page.

/** One change: its day, who, what they did and why. A save of several things is one entry with a line each. */
function History({ changes }: { changes: Change[] }) {
  return (
    <Card as="section" aria-labelledby="mr-history" data-section="history">
      <h2 id="mr-history">What changed, and when</h2>
      {changes.length === 0 ? (
        <p className="mr-note">Nothing has been changed yet. These are the rules the school started with.</p>
      ) : (
        <ul className="mr-history">
          {changes.map((c, i) => (
            <li key={i} data-change>
              <time dateTime={c.on}>{dayWords(c.on)}</time>
              <div>
                <ul>
                  {c.changes.map((line) => (
                    <li key={line}>
                      <strong>{c.by}</strong> {line}
                    </li>
                  ))}
                </ul>
                {c.reason ? <p className="mr-why">Because: {c.reason}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function MoneyRulesPage({ searchParams }: Props) {
  const me = await requireStaff();
  const q = await searchParams;
  let view: RulesView | null = null;
  let down: string | null = null;
  try {
    view = await rulesOf(me.email);
  } catch (e) {
    if (!(e instanceof EngineDown)) throw e;
    down = e.message;
  }
  return (
    <Screen
      stage="Money"
      title="Money rules"
      purpose="The limits, approvals and categories the school's money follows."
      next={{ href: "/money", label: "My claims" }}
    >
      <div className="mr-page">
        {down ? (
          <p className="mr-alert" role="alert">
            {down}
          </p>
        ) : null}
        {view && !view.can_set ? (
          <p className="mr-note" role="note">
            Only the co-founders change these rules. You can read them here.
          </p>
        ) : null}
        {q.saved && view?.can_set ? (
          <p className="mr-saved" role="status">
            <Icon name="done" size={20} />
            Saved. Claims filed from now on follow these rules.
          </p>
        ) : null}
        {view ? (
          <>
            {/* a new key whenever the rules or the history moved: what is shown is what was just saved, not what was typed before it */}
            <RulesForm key={`${view.version}-${view.history.length}`} view={view} editable={view.can_set} />
            <History changes={view.history} />
          </>
        ) : null}
      </div>
    </Screen>
  );
}
