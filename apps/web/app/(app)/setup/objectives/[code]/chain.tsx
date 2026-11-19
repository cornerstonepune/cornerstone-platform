import { MachineIf } from "@/components/origin";
import type { Chain } from "@/lib/objective-chain";
import { ORIGIN_WORDS } from "@/lib/origin";

// Where an objective sits (CP-64): its grade, subject, topic, capability and the framework statements it is held against. What it builds
// and what builds toward it are the page's two lists, not drawn twice (Nimish, 19 Nov 2026). Words only where the school holds them: a framework whose
// words may not be republished shows its statement's printed number.
export function ObjectiveChain({ c }: { c: Chain }) {
  return (
    <section className="grid gap-[var(--space-4)]" aria-label="Where it sits" data-chain>
      <div className="grid content-start gap-[var(--space-2)]" data-chain-up>
                <ol className="grid gap-[var(--space-1)]">
          <li data-chain-grade>Grade: {c.band}</li>
          <li data-chain-subject>Subject: {c.subject ?? "none yet"}</li>
          <li data-chain-topic>Topic: {c.topic ?? "none yet"}</li>
          {c.capability ? (
            <li data-chain-capability>
              Capability: {c.capability.name}
              {c.capability.words.length ? ` (${c.capability.words.join(", ")})` : ""} <MachineIf origin={c.capability.origin} />
            </li>
          ) : null}
        </ol>
        {c.statements.length ? (
          <ul className="grid gap-[var(--space-1)]" aria-label="Held against" data-chain-statements>
            {c.statements.map((s) => (
              <li key={`${s.framework}~${s.code}~${s.relation}`}>
                <strong>{s.frameworkName}</strong> {s.printed ?? s.code}: {s.text ?? "words held privately"} <span className="b-muted">({s.relation.replace(/_/g, " ")}{s.origin ? `, ${ORIGIN_WORDS[s.origin].toLowerCase()}` : ""})</span> <MachineIf origin={s.origin} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-muted" data-chain-no-statements>Held against no framework statement yet.</p>
        )}
      </div>
    </section>
  );
}
