// Which screens of the inventory are built (docs/frontend/screens.json, copied to design-system/built.json by
// scripts/tokens.mjs): those of a slice in `merged_slices`. A door, a rail edge or a link to another screen is drawn only
// when its target is built, so nothing on the site is a dead link while the screens are still being made (UI-13).
import data from "../design-system/built.json";

type Entry = { route: string; built: boolean };
const SCREENS = data.screens as Record<string, Entry>;

// A pull request's browser run names the screens it covers (SCREEN=a,b, as tests/inventory/load.ts reads it): the website that run
// serves draws the links between them, as it will once their slice is in `merged_slices`. Unset, as in production, it changes nothing.
const covering = (id: string) => (process.env.SCREEN ?? "").split(",").includes(id);

export const isBuilt = (screenId: string): boolean => SCREENS[screenId]?.built === true || (screenId in SCREENS && covering(screenId));

/** The address of a built screen, its `[param]`s filled from `params`; null when the screen is not built (or a param is missing). */
export function screenHref(screenId: string, params: Record<string, string> = {}): string | null {
  const s = SCREENS[screenId];
  if (!s || !isBuilt(screenId)) return null;
  let missing = false;
  const path = s.route.replace(/\[(\w+)\]/g, (_, k: string) => (params[k] ? encodeURIComponent(params[k]) : ((missing = true), "")));
  return missing ? null : path;
}
