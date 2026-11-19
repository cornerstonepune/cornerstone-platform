// The words of the Catalogue and the item picker (CP-84b), in one place: what the engine sends, how a group is named and which field a refusal is about.
// Pure, so a client form and a page share it. Nothing is decided here: what an item is, which category it files under and who may change it are the engine's.
export type Item = { code: string; name: string; unit: string; category: string | null; aliases: string[] };
export type Group = { category: string | null; items: Item[] };
export type Close = { code: string; name: string };
/** What `POST /materials/items/search` answers: the items by category, the names close to what was typed, what this person may do and the school's categories. */
export type Found = { groups: Group[]; close: Close[]; can: { add: boolean; categorise: boolean }; categories: string[] };
/** An item as a form holds it once chosen. */
export type Picked = { code: string; name: string; unit: string; category: string | null };
/** A word the items with no category end in, and how many of them do. */
export type CommonWord = { word: string; items: number };

/** The group of items with no category, as the school says it. */
export const NEEDS = "Needs a category";
export const groupName = (category: string | null): string => category ?? NEEDS;

/** The groups with "needs a category" first (the engine puts it last, where a picker wants it), the school's own order after it. */
export const needsFirst = (groups: readonly Group[]): Group[] => [...groups.filter((g) => g.category === null), ...groups.filter((g) => g.category !== null)];

export const countOf = (groups: readonly Group[]): number => groups.reduce((n, g) => n + g.items.length, 0);

/** The address of the Catalogue with its choices: only what is set shows. */
export function catalogueAt(o: { q?: string; category?: string; page?: number }): string {
  const p = new URLSearchParams();
  if (o.q) p.set("q", o.q);
  if (o.category) p.set("category", o.category);
  if (o.page && o.page > 1) p.set("page", String(o.page));
  const s = p.toString();
  return s ? `/setup/catalogue?${s}` : "/setup/catalogue";
}

/** The value of the category filter for the group that has none. */
export const NEEDS_VALUE = "needs";

export type AddField = "name" | "unit" | "category";

/** The field an add's refusal is about, so its words stand beside it; none for a refusal about the person ("You may add an item only if…"). The engine's
 *  phrases say the field they are about in the same words each time (a name, a unit, a category), checked in that order of how specific they are. */
export function fieldOfAdd(words: string): AddField | null {
  if (/categor/i.test(words)) return "category";
  if (/\bunit\b/i.test(words)) return "unit";
  if (/\bname\b/i.test(words)) return "name";
  return null;
}

/** The units a new item is most often counted in, offered as the field's suggestions (a person may type another). */
export const COMMON_UNITS = ["piece", "box", "packet", "sheet", "roll", "set", "bottle", "bundle", "kg", "litre", "metre"] as const;
