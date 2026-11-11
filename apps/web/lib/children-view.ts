// What the Children screens say, worked out from rows already read (UI-3b). Pure: no database, no React, so a plain test can
// hold every rule. The rules here are computed each time and never stored (groups, buckets, the strip of absences).
import { dateWords } from "./week";

/** The school's colour of a state (`child_state.colour`) is all this file knows of a state: no state code is named here. */
import { PRACTISING, SECURE, UNSEEN, EMERGING, type Bucket, type Look } from "./looks";
export type { Bucket };

/** Green is secure; any other state a child was seen in is practising; no row at all is not seen yet. Never a red segment. */
export const bucketOf = (colour: string | null): Bucket => (colour === null ? UNSEEN : colour === "green" ? SECURE : PRACTISING);

export type Counts = { secure: number; practising: number; unseen: number };

/** A child's standing from the colours of the states they have, against the number of skills anyone in the class was seen on. */
export function countsOf(colours: readonly string[], skillCount: number): Counts {
  const c = { secure: 0, practising: 0, unseen: 0 };
  for (const colour of colours) {
    if (bucketOf(colour) === SECURE) c.secure++;
    else c.practising++; // a seen state that is not secure; not seen is no row, counted below
  }
  c.unseen = Math.max(0, skillCount - c.secure - c.practising);
  return c;
}

/** One day of the strip: noted absent; a lesson was held and none was noted; or no confirmed lesson (blank, never "present"). */
export type Day = { date: string; cell: "absent" | "none" | "no-lesson" };

/** The strip of one child over the class's last school days: `days` are the days (oldest first) with whether the class had a
 *  confirmed lesson; `absentOn` the days an absence was noted for the child. */
export function stripOf(days: readonly { date: string; lesson: boolean }[], absentOn: ReadonlySet<string>): Day[] {
  return days.map((d) => ({ date: d.date, cell: absentOn.has(d.date) ? "absent" : d.lesson ? "none" : "no-lesson" }));
}

export const noted = (strip: readonly Day[]) => strip.filter((d) => d.cell === "absent").length;

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayName = (iso: string) => WEEKDAY[new Date(`${iso}T12:00:00Z`).getUTCDay()];

/** The strip said for a screen reader: "Absences noted, last 7 school days: none Monday, absent Tuesday, no lesson Thursday". */
export const stripWords = (strip: readonly Day[]) =>
  `Absences noted, last ${strip.length} school days: ${strip.map((d) => `${d.cell === "absent" ? "absent" : d.cell === "none" ? "none" : "no lesson"} ${dayName(d.date)}`).join(", ")}`;

export type Row = {
  childId: string;
  roll: string;
  name: string;
  classId: string;
  section: string;
  counts: Counts;
  lastSeen: string | null;
  /** Notes waiting on the child; null where it is not known (the engine did not answer for the class). */
  waiting: number | null;
  strip: Day[];
};

export type Filters = { q?: string; cls?: string; show?: "attention"; group?: Group };
export const GROUPS = ["class", "doing", "attention"] as const;
export type Group = (typeof GROUPS)[number];

/** Days since a date (whole days), `today` being an ISO date. */
export const daysSince = (iso: string, today: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);

/** Needs attention: never seen on any skill, or not seen for `days` days or more (the school's window, a setting). */
export const needsAttention = (r: Pick<Row, "lastSeen">, today: string, days: number) => r.lastSeen === null || daysSince(r.lastSeen, today) >= days;

/** Search by name or Sr. No. (a part of either, any case), class, and needs attention. */
export function filterRows(rows: readonly Row[], f: Filters, today: string, days: number): Row[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!q || r.name.toLowerCase().includes(q) || r.roll.toLowerCase() === q || r.roll.toLowerCase().startsWith(q)) &&
      (!f.cls || r.classId === f.cls) &&
      (f.show !== "attention" || needsAttention(r, today, days)),
  );
}

/** Sr. No. order: numbers by value, then the rest as text. */
export const byRoll = (a: Pick<Row, "roll">, b: Pick<Row, "roll">) => a.roll.length - b.roll.length || a.roll.localeCompare(b.roll, "en", { numeric: true });

/** How they are doing, in the words of the three buckets: most skills secure, most practising, or not seen yet. */
export const doingOf = (c: Counts): Bucket => (c.secure + c.practising === 0 ? UNSEEN : c.secure >= c.practising ? SECURE : PRACTISING);

export const DOING_WORDS: Record<string, string> = { secure: "Secure on most skills seen", practising: "Still practising on most skills seen", unseen: "Not seen yet on any skill" } as const;

/** Groups are computed, never stored: a child is in exactly one, and the counts sum to the rows. Groups keep a fixed order. */
export function groupRows(rows: readonly Row[], by: Group, today: string, days: number): { key: string; words: string; rows: Row[] }[] {
  const keyOf = (r: Row): [string, string, number] => {
    if (by === "class") return [r.classId, r.section, 0];
    if (by === "doing") {
      const d = doingOf(r.counts);
      return [d, DOING_WORDS[d], d === SECURE ? 2 : d === PRACTISING ? 1 : 3];
    }
    return needsAttention(r, today, days) ? ["attention", "Needs attention", 0] : ["fine", "Nothing needs attention", 1];
  };
  const out = new Map<string, { key: string; words: string; order: number; rows: Row[] }>();
  for (const r of rows) {
    const [key, words, order] = keyOf(r);
    const g = out.get(key) ?? { key, words, order, rows: [] };
    g.rows.push(r);
    out.set(key, g);
  }
  return [...out.values()]
    .sort((a, b) => a.order - b.order || a.words.localeCompare(b.words, "en", { numeric: true }))
    .map(({ key, words, rows: rs }) => ({ key, words, rows: rs.sort(byRoll) }));
}

/** "Mon" style words for the last-seen column: the date the site says it, or "not yet". */
export const lastSeenWords = (iso: string | null, today: string) => {
  if (iso === null) return "not yet";
  const n = daysSince(iso, today);
  return n <= 0 ? "today" : n === 1 ? "yesterday" : n < 7 ? `${n} days ago` : dateWords(iso);
};

/** The initials of a name, for the disc: first letters of the first two words. */
export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export type Place = { id: string; look: Look | null; readyNext: boolean; attention: boolean };
export type Cluster = { key: string; words: string; ids: string[] };

/** Clusters of children who share a place on the chosen skill, computed here from the graph's rows and never by a model. A child may
 *  be in several: secure and ready for the next skill, still practising, not seen on it yet, and not seen for two weeks or more. */
export function clustersOf(places: readonly Place[]): Cluster[] {
  const pick = (f: (p: Place) => boolean) => places.filter(f).map((p) => p.id);
  return [
    { key: "ready", words: "Secure here, ready for the next skill", ids: pick((p) => p.look === SECURE && p.readyNext) },
    { key: "working", words: "Practising here", ids: pick((p) => p.look === PRACTISING) },
    { key: "unseen", words: "Not seen on this skill yet", ids: pick((p) => p.look === null) },
    { key: "attention", words: "Not seen for two weeks or more", ids: pick((p) => p.attention) },
  ];
}

/** The picture's squares grouped by their state on the skill: a child is in exactly one group, the counts sum to the squares. */
export const LOOK_ORDER = [SECURE, PRACTISING, EMERGING, UNSEEN] as const;
export type PictureLook = Bucket;
export function groupByLook<T extends { look: PictureLook }>(cells: readonly T[]): { look: PictureLook; cells: T[] }[] {
  return LOOK_ORDER.map((look) => ({ look, cells: cells.filter((c) => c.look === look) })).filter((g) => g.cells.length > 0);
}

/** The open peek as the address carries it: the class and the Sr. No., never a name. */
export const peekParam = (c: { classId: string; roll: string }) => `${c.classId}:${c.roll}`;
