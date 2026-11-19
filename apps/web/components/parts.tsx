import type { ReactNode } from "react";
import type { Session } from "@/lib/auth";
import { Card } from "./cards";
import { DoorIcon, Trail } from "./trail";
import { Icon, type IconName } from "@/lib/icons";

// The small parts a page is made of: the page's head and body, a panel, a pill, a tile, a notice. (They lived in the old shell's file.)

/** The eyebrow says something the title does not (a day and a class, a count waiting, a stage): one that only repeats the title is
 *  not drawn (Nimish, 11 Nov 2026: "these kinds of empty spaces should not be there"). */
export const eyebrowSays = (stage: string, title: string) => {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(stage) !== "" && norm(stage) !== norm(title);
};

/** The head of a page: the trail (the door, then the thing), the eyebrow when it says more than the title, the one h1, the purpose
 *  line across the column. `inColumn`: drawn inside a Screen's main column (beside the rail, as the wireframes' `.page` grid), so the
 *  column's own padding holds it and no rule or divider follows it. */
export function PageHeader({ stage, title, sub, icon, inColumn, chip, trail }: { stage: string; title: string; sub: string; icon?: IconName; inColumn?: boolean; /** a state chip beside the eyebrow (the Timetable: Live or Planning) */ chip?: ReactNode; /** the page's own path, in place of the door and the thing */ trail?: ReactNode }) {
  return (
    <header className={inColumn ? undefined : "border-b border-[var(--line)] px-[var(--space-3)] pt-3 pb-3 md:px-[var(--space-4)]"}>
      {trail ?? <Trail thing={title} />}
      {eyebrowSays(stage, title) ? (
        <div className="mb-1 flex items-center gap-[var(--space-1)] truncate text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] md:whitespace-normal" data-testid="stage">
          {icon ? <Icon name={icon} size={16} /> : <DoorIcon />}
          <span>{stage}</span>
          {chip ? <span className="ml-[var(--space-1)]">{chip}</span> : null}
        </div>
      ) : chip ? (
        <div className="mb-1">{chip}</div>
      ) : null}
      <h1 className="text-title-page leading-tight md:text-title-page">{title}</h1>
      <p data-purpose="" className="mt-1 max-w-[62ch] text-[length:var(--text-body)] leading-[1.5] text-[var(--ink-muted)] md:text-body">{sub}</p>
    </header>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1 px-[var(--space-3)] pt-[var(--space-3)] pb-[var(--space-5)] md:px-[var(--space-4)]">{children}</div>;
}

// `label` names the panel as a region for a screen reader (and a test); `id` makes it a link target. The panel is
// the grid item itself — never wrap it to name it: a wrapper loses the card's min-width and a wide table then
// pushes a phone's page sideways.
export function Panel({ title, aside, label, id, children }: { title: string; aside?: ReactNode; label?: string; id?: string; children: ReactNode }) {
  return (
    <Card as="section" className={id ? "scroll-mt-6" : undefined} aria-label={label} id={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-2)]">
        <h2 className="font-heading text-body">{title}</h2>
        {aside ? <div className="fact text-[length:var(--text-caption)] text-basalt/55">{aside}</div> : null}
      </div>
      <div className="min-w-0 overflow-x-auto">{children}</div>
    </Card>
  );
}

export function Pill({ tone, children }: { tone: "neem" | "bamboo" | "terracotta" | "monsoon"; children: ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

// The material a state is drawn in. One place, because two screens now show the same states and a
// second copy is a second vocabulary.
export const TONE_BG = { neem: "bg-neem", bamboo: "bg-bamboo", terracotta: "bg-terracotta", monsoon: "bg-monsoon" } as const;
export const TONE_EDGE = { neem: "border-l-neem", bamboo: "border-l-bamboo", terracotta: "border-l-terracotta", monsoon: "border-l-monsoon" } as const;
export type Tone = keyof typeof TONE_BG;

export function Tile({ tone, n, words }: { tone: Tone; n: number; words: string }) {
  return (
    <Card compact className={`border-l-4 ${TONE_EDGE[tone]}`}>
      <div className="font-heading text-title-page leading-none">{n}</div>
      <div className="text-label text-basalt/62">{words}</div>
    </Card>
  );
}

export function Bar({ tone, share, width }: { tone: Tone; share: number; width: number }) {
  return (
    <span className="inline-block h-1.5 bg-basalt/10" style={{ width }} aria-hidden="true">
      <span className={`block h-full ${TONE_BG[tone]}`} style={{ width: `${Math.round(share * 100)}%` }} />
    </span>
  );
}

export function Notice({ tone, children, alert }: { tone: "neem" | "terracotta"; children: ReactNode; alert?: boolean }) {
  return (
    <Card as="p" tone="quiet" compact className={`mb-4 block text-label ${tone === "neem" ? "bg-neem/10" : "bg-terracotta/10"}`} role={alert ? "alert" : "status"}>
      {children}
    </Card>
  );
}

// Three signals, never two: blank, wrong, and wrong-with-working stay distinct (rule 5).
export function MarkPill({ status, working }: { status: string; working?: string }) {
  if (status === "correct") return <Pill tone="neem">right</Pill>;
  if (status === "blank") return <Pill tone="monsoon">blank</Pill>;
  if (status === "wrong") return <Pill tone="terracotta">{working ? "wrong · with working" : "wrong"}</Pill>;
  if (status === "unreadable") return <Pill tone="bamboo">could not read</Pill>;
  if (status === "needs_teacher") return <Pill tone="bamboo">for you to judge</Pill>;
  return <Pill tone="monsoon">{status}</Pill>;
}

// A section whose data does not exist yet says so, names what fills it, and shows the real count.
export function NotYet({ what, when, facts }: { what: string[]; when: string; facts: [string, number][] }) {
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_300px]">
      <Panel title="What this screen will show">
        <ul className="grid gap-2 text-[length:var(--text-label)]">
          {what.map((w) => (
            <li key={w} className="flex gap-3">
              <span className="mt-2 h-0.5 w-4 shrink-0 bg-basalt/25" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
        <p className="note mt-4">{when}</p>
      </Panel>
      <Panel title="In the database today">
        <table className="grid">
          <tbody>
            {facts.map(([k, n]) => (
              <tr key={k}>
                <td className="fact">{k}</td>
                <td className="num">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

/** The classes a person teaches, as the menu says them: the coordinator's are every class. */
export function classesSaid(me: Pick<Session, "role" | "classes">): string {
  if (me.role === "coordinator") return "Every class";
  return me.classes?.length ? `Teaches ${me.classes.join(", ")}` : "No class yet";
}
