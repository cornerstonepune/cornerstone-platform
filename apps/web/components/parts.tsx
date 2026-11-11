import type { ReactNode } from "react";
import type { Session } from "@/lib/auth";
import { Trail } from "./trail";
import { Icon, type IconName } from "@/lib/icons";

// The small parts a page is made of: the page's head and body, a panel, a pill, a tile, a notice. (They lived in the old shell's file.)

/** The head of a page: the trail (the door, then the thing), the eyebrow, the one h1, the purpose line. */
export function PageHeader({ stage, title, sub, icon }: { stage: string; title: string; sub: string; icon?: IconName }) {
  return (
    <header className="border-b border-[var(--line)] px-5 pt-3 pb-[18px] md:px-9 md:pt-4">
      <Trail thing={title} />
      <div className="mb-1 flex items-center gap-[var(--space-1)] truncate text-[length:var(--text-eyebrow)] font-medium tracking-[0.08em] text-[var(--ink-muted)] uppercase md:mb-2 md:whitespace-normal" data-testid="stage">
        {icon ? <Icon name={icon} size={16} /> : null}
        <span>{stage}</span>
      </div>
      <h1 className="text-[22px] leading-tight md:text-[26px]">{title}</h1>
      <p className="mt-[6px] max-w-[620px] text-[13.5px] leading-[1.5] text-basalt/62">{sub}</p>
      <div className="chalkline" />
    </header>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1 px-5 pt-[22px] pb-8 md:px-9">{children}</div>;
}

// `label` names the panel as a region for a screen reader (and a test); `id` makes it a link target. The panel is
// the grid item itself — never wrap it to name it: a wrapper loses `.panel`'s min-width and a wide table then
// pushes a phone's page sideways.
export function Panel({ title, aside, label, id, children }: { title: string; aside?: ReactNode; label?: string; id?: string; children: ReactNode }) {
  return (
    <section className={`panel${id ? " scroll-mt-6" : ""}`} aria-label={label} id={id}>
      <div className="panel-head">
        <h2 className="text-[16px]">{title}</h2>
        {aside ? <div className="fact text-[11px] text-basalt/55">{aside}</div> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
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
    <div className={`panel border-l-4 p-3 ${TONE_EDGE[tone]}`}>
      <div className="font-heading text-[26px] leading-none">{n}</div>
      <div className="mt-2 text-[12.5px] text-basalt/62">{words}</div>
    </div>
  );
}

export function Bar({ tone, share, width }: { tone: Tone; share: number; width: number }) {
  return (
    <span className="inline-block h-[6px] bg-basalt/10" style={{ width }} aria-hidden="true">
      <span className={`block h-full ${TONE_BG[tone]}`} style={{ width: `${Math.round(share * 100)}%` }} />
    </span>
  );
}

export function Notice({ tone, children, alert }: { tone: "neem" | "terracotta"; children: ReactNode; alert?: boolean }) {
  return (
    <p className={`mb-4 border p-3 text-[13.5px] ${tone === "neem" ? "border-neem/30 bg-neem/10" : "border-terracotta/30 bg-terracotta/10"}`} role={alert ? "alert" : "status"}>
      {children}
    </p>
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
    <div className="grid gap-[18px] md:grid-cols-[1fr_300px]">
      <Panel title="What this screen will show">
        <ul className="grid gap-2 text-[14px]">
          {what.map((w) => (
            <li key={w} className="flex gap-3">
              <span className="mt-[9px] h-[2px] w-4 shrink-0 bg-basalt/25" />
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
