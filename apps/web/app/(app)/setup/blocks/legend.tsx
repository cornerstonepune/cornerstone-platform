import { KindTile, type Kind } from "@/components/kind-tile";
import { STATES, StatusChip, type State } from "@/components/status-chip";
import { ACTIONS, ICON_SIZE, Icon, type IconName } from "@/lib/icons";
import tokens from "@/design-system/tokens.json";

// The legend: everything the blocks are drawn from, read from STATES, lib/icons.tsx and tokens.json — nothing typed here
// but the words about where each logo file is used and the five rules of the school's logo (docs/brand/cornerstone-logo/READ-ME.txt).
type Tok = { name: string; usage?: string; value: string | { light: string; dark: string } };
const names = (prefix: string) => (tokens.color.tokens as Tok[]).map((t) => t.name).filter((n) => n.startsWith(prefix) && !n.endsWith("-bg") && !n.endsWith("-ink"));
const subjectIcon = (s: string): IconName => (s === "fixed" ? "break" : (s as IconName));

const LOGOS = [
  { file: "Cornerstone-logo-lockup-colour.svg", name: "lockup-colour", ground: "light", used: "The bar of every page, on the light ground." },
  { file: "Cornerstone-logo-lockup-for-dark-backgrounds.svg", name: "lockup-for-dark-backgrounds", ground: "dark", used: "The bar of every page, on the dark ground." },
  { file: "Cornerstone-logo-mark.svg", name: "mark", ground: "light", used: "Alone where the space is small, on a light ground: the bar on a phone." },
  { file: "Cornerstone-logo-mark-on-white-tile.svg", name: "mark-on-white-tile", ground: "dark", used: "Small on a dark ground, the tab icon and the app icon." },
];
const RULES = [
  "Never recolour the mark.",
  "On a dark ground the mark sits on the white tile.",
  "Keep clear space on every side of a quarter of the mark's height.",
  "Do not stretch or rotate it.",
  "No shadow, and never inside a card.",
];

export function Legend() {
  const kinds = names("kind-").map((n) => n.slice(5));
  const subjects = names("subject-").map((n) => n.slice(8));
  return (
    <section data-section="legend" aria-labelledby="legend-h" className="b-legend">
      <h2 id="legend-h">The legend</h2>
      <div data-legend="states">
        <h3>States: an icon, a word and a colour</h3>
        <ul>{(Object.keys(STATES) as State[]).map((s) => <li key={s}><StatusChip state={s} round /></li>)}</ul>
      </div>
      <div data-legend="actions">
        <h3>Actions</h3>
        <ul>{ACTIONS.map((a) => <li key={a} className="b-swatch" data-action={a}><span className="b-stile" data-subject="fixed"><Icon name={a} size={ICON_SIZE.row} /></span>{a}</li>)}</ul>
      </div>
      <div data-legend="kinds">
        <h3>Kinds of thing</h3>
        <ul>{kinds.map((k) => <li key={k} className="b-swatch" data-legend-kind={k}><KindTile kind={k as Kind} />{k}</li>)}</ul>
      </div>
      <div data-legend="subjects">
        <h3>Subjects</h3>
        <ul>{subjects.map((s) => <li key={s} className="b-swatch" data-legend-subject={s} data-subject={s}><span className="b-stile"><Icon name={subjectIcon(s)} size={ICON_SIZE.row} /></span><span className="b-subj">{s}</span></li>)}</ul>
      </div>
      <div data-legend="shapes">
        <h3>Shapes</h3>
        <ul>
          {(tokens.radius.tokens as Tok[]).map((r) => <li key={r.name} className="b-swatch" data-legend-shape={r.name}><span className="b-shape" style={{ borderRadius: `var(--${r.name})` }} />{r.name} · {String(r.value)}</li>)}
          {(tokens.shadow.tokens as Tok[]).map((r) => <li key={r.name} className="b-swatch" data-legend-shape={r.name}><span className="b-shape" style={{ borderRadius: "var(--radius-card)", boxShadow: `var(--${r.name})` }} />{r.name}</li>)}
        </ul>
      </div>
      <div data-legend="logos">
        <h3>The logo: four files</h3>
        <ul className="b-logos">
          {LOGOS.map((l) => (
            <li key={l.file} className="b-logo" data-logo={l.name} style={{ display: "grid" }}>
              <div className="b-ground" data-ground={l.ground}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/brand/${l.file}`} alt={`Cornerstone Gurukul, ${l.name}`} />
              </div>
              <b>{l.name}</b>
              <span className="b-muted">{l.used}</span>
            </li>
          ))}
        </ul>
        <ul data-logo-rules style={{ display: "grid", marginTop: "var(--space-3)" }}>{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
    </section>
  );
}
