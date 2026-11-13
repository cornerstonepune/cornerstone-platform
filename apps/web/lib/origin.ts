// Where a link or a made thing came from (CP-48): three words, the same everywhere a person reads them. The rows store the school's own
// words for it, which differ by table: `activity_skill`, `activity_objective`, `learning_objective_skill` and `learning_objective` say
// school | machine | person; an activity's part (`activity_part_source`) says school | drafted | person; a plan line's activity
// (`plan_entry.link_rule`) says exact_name | model | person. A person reads them as sheet, machine or person. Pure: no database here.
export const ORIGINS = ["sheet", "machine", "person"] as const;
export type Origin = (typeof ORIGINS)[number];

/** The word a list's filter and a row's origin show. */
export const ORIGIN_WORDS: Record<Origin, string> = { sheet: "Sheet", machine: "Machine", person: "Person" };

const STORED: Record<string, Origin> = { school: "sheet", exact_name: "sheet", machine: "machine", drafted: "machine", model: "machine", person: "person" };

/** A stored word as a person reads it; none for a row that carries none (a part with no words, a lesson with no activity). */
export const originOf = (stored: string | null | undefined): Origin | null => (stored ? (STORED[stored] ?? null) : null);

/** The origin an address names, when it names one of the three. */
export const pickOrigin = (v: string | undefined): Origin | undefined => (ORIGINS as readonly string[]).includes(v ?? "") ? (v as Origin) : undefined;

/** Whether a thing passes the origin filter: no filter passes everything; else the thing carries that origin. */
export const passes = (want: Origin | undefined, has: Origin | null | readonly (Origin | null)[]) => !want || (Array.isArray(has) ? has.includes(want) : has === want);

/** The origins a set of stored words comes to, each once, in the order sheet, machine, person. */
export const originsOf = (stored: readonly (string | null | undefined)[]): Origin[] => {
  const seen = new Set(stored.map(originOf));
  return ORIGINS.filter((o) => seen.has(o));
};
