import Link from "@/components/link";
import { MachineIf } from "@/components/origin";
import { screenHref } from "@/lib/built";
import type { Chain } from "@/lib/objective-chain";
import { ORIGIN_WORDS } from "@/lib/origin";

// The whole chain of one objective, both ways (CP-64): up to the grade, subject, topic, capability and the framework statements it is held
// against; down to the skills it builds and the activities that build toward it. Words only where the school holds them: a framework whose
// words may not be republished shows its statement's printed number.
export function ObjectiveChain({ c }: { c: Chain }) {
  const skill = (code: string) => screenHref("skill", { code }) ?? `/setup/skills/${encodeURIComponent(code)}`;
  const activity = (code: string) => screenHref("activity", { code }) ?? `/setup/activities/${encodeURIComponent(code)}`;
  return (
    <section className="grid gap-[var(--space-4)] md:grid-cols-2" aria-label="The whole chain" data-chain>
      <div className="grid content-start gap-[var(--space-2)]" data-chain-up>
        <h2 className="b-label b-muted">Up the chain</h2>
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
      <div className="grid content-start gap-[var(--space-2)]" data-chain-down>
        <h2 className="b-label b-muted">Down the chain</h2>
        <h3 className="b-label b-muted">Skills it builds</h3>
        {c.skills.length ? (
          <ul className="grid gap-[var(--space-1)]" data-chain-skills>
            {c.skills.map((s) => (
              <li key={s.code} data-chain-skill={s.code}>
                <Link href={skill(s.code)}>{s.name}</Link> · {s.evidence} piece{s.evidence === 1 ? "" : "s"} of confirmed evidence <MachineIf origin={s.origin} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-muted">No skill linked yet.</p>
        )}
        <h3 className="b-label b-muted">Activities that build toward it</h3>
        {c.activities.length ? (
          <ul className="grid gap-[var(--space-1)]" data-chain-activities>
            {c.activities.map((a) => (
              <li key={a.code} data-chain-activity={a.code}>
                <Link href={activity(a.code)}>{a.name}</Link> <MachineIf origin={a.origin} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="b-muted">No activity linked yet.</p>
        )}
      </div>
    </section>
  );
}
