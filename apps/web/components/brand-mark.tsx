// The school's logo (Cornerstone Gurukul), one of the four official files drawn exactly as given (docs/brand/cornerstone-logo,
// copied byte for byte to public/brand by scripts/tokens.mjs). Never recoloured, stretched, rotated, filtered or shadowed, and
// never inside a card (docs/frontend/SPEC.md §3 "The logo"); its clear space is a quarter of its height, kept by the bar.
// One <img> inside a <picture>: the browser picks the file for the ground (light or dark colour scheme) and for the room
// (the lockup on a bar, the mark alone on a phone), so the file served is always one of the four.
const F = (name: string) => `/brand/Cornerstone-logo-${name}.svg`;

export const BRAND_NAME = "Cornerstone Gurukul";

/** `bar`: 40 px high, the lockup, the mark alone at 700 px or less. `large`: the sign-in page's, 72 px high, the lockup. */
export function BrandMark({ size = "bar" }: { size?: "bar" | "large" }) {
  const height = size === "bar" ? 40 : 72;
  return (
    <picture data-brand-mark className="block leading-none">
      {size === "bar" ? <source media="(max-width: 700px) and (prefers-color-scheme: dark)" srcSet={F("mark-on-white-tile")} /> : null}
      {size === "bar" ? <source media="(max-width: 700px)" srcSet={F("mark")} /> : null}
      <source media="(prefers-color-scheme: dark)" srcSet={F("lockup-for-dark-backgrounds")} />
      {/* a vector, drawn as it is: the server never resizes it */}
      <img src={F("lockup-colour")} alt={BRAND_NAME} height={height} style={{ height, width: "auto" }} />
    </picture>
  );
}
