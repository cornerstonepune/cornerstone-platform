import { STATES, type State } from "./status-chip";
import { StatusChip } from "./status-chip";
import { lookOf } from "./stack-bar";
import type { Subject } from "./period-row";

export type GraphSkill = { name: string; state: State; seen: number; domain: Exclude<Subject, "fixed">; href: string };
const DOMAINS = ["numeracy", "language", "arts"] as const;
const CX = 200, CY = 150, R = 110;
const at = (deg: number, r = R) => ({ x: CX + r * Math.cos((deg * Math.PI) / 180), y: CY + r * Math.sin((deg * Math.PI) / 180) });
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The child's initials at the centre; a coloured ring arc for each domain; each skill a node on the outer ring, filled with
 *  its state's tint, edged in its state colour, sized by times seen, labelled with name and state word; node and label one
 *  link with a 44 px target. A table of the same skills sits beside it; on a phone the graph is replaced by that list. */
export function ChildGraph({ initials, skills, empty = "No skill seen yet" }: { initials: string; skills: readonly GraphSkill[]; empty?: string }) {
  if (skills.length === 0) return <p data-block="ChildGraph" data-empty className="b-chart-empty">{empty}</p>;
  const arcs = DOMAINS.map((d, i) => {
    const a = -90 + i * 120, b = a + 120;
    const p = at(a), q = at(b);
    return { d, path: `M${r2(p.x)} ${r2(p.y)} A${R} ${R} 0 0 1 ${r2(q.x)} ${r2(q.y)}`, a, b };
  });
  const placed = skills.map((s) => {
    const arc = arcs[DOMAINS.indexOf(s.domain)];
    const mates = skills.filter((k) => k.domain === s.domain);
    const k = mates.indexOf(s);
    const p = at(arc.a + ((k + 1) / (mates.length + 1)) * 120);
    return { s, p, radius: Math.min(18, 8 + s.seen * 2) };
  });
  return (
    <div data-block="ChildGraph" className="b-cgraph">
      <svg viewBox="-80 0 560 310" role="group" aria-label="Skills seen around one child">
        <circle className="b-ring" cx={CX} cy={CY} r={R} />
        {arcs.map((a) => <path key={a.d} className="b-dom" data-subject={a.d} d={a.path} />)}
        <circle className="b-ctr" cx={CX} cy={CY} r={30} />
        <text className="b-ctr-t" x={CX} y={CY + 5} textAnchor="middle">{initials}</text>
        {placed.map(({ s, p, radius }) => {
          const right = p.x >= CX;
          const tx = right ? p.x + radius + 8 : p.x - radius - 8;
          return (
            <a key={s.name} href={s.href}>
              <rect x={r2(right ? p.x - radius : p.x - radius - 130)} y={r2(p.y - 22)} width={130 + radius * 2} height={44} fill="transparent" />
              <circle className="b-node" data-state={lookOf(s.state)} cx={r2(p.x)} cy={r2(p.y)} r={radius} />
              <text x={r2(tx)} y={r2(p.y - 2)} textAnchor={right ? "start" : "end"}>{s.name}</text>
              <text className="b-w" data-state={lookOf(s.state)} x={r2(tx)} y={r2(p.y + 16)} textAnchor={right ? "start" : "end"}>{STATES[s.state].words}</text>
            </a>
          );
        })}
      </svg>
      <div className="b-table-box">
        <table className="grid list steady" aria-label="The same skills">
          <thead><tr><th scope="col">Skill</th><th scope="col">State</th></tr></thead>
          <tbody>
            {skills.map((s) => (
              <tr key={s.name}>
                <td data-label="Skill"><a href={s.href}>{s.name}</a></td>
                <td data-label="State"><StatusChip state={s.state} round /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
