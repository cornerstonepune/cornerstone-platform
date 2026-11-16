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

// CP-51: what the machine made sits in the curriculum from the start, and reads "To approve" until a person approves it (or, for a
// skill's levels, until a person approves them); then "Approved". The words are the Skills list's (lib/curriculum-list.ts). Approval gates
// one thing: a mark on an activity becomes evidence only on links the school or a person made.
export const APPROVALS = ["toApprove", "approved"] as const;
export type Approval = (typeof APPROVALS)[number];
export const APPROVAL_WORDS: Record<Approval, string> = { toApprove: "To approve", approved: "Approved" };

/** "To approve" when anything of it is the machine's, or something else of it still waits for a person; else "Approved". */
export const approvalOf = (origins: readonly (Origin | null)[], waiting = false): Approval => (waiting || origins.includes("machine") ? "toApprove" : "approved");

/** The approval an address names, when it names one of the two. */
export const pickApproval = (v: string | undefined): Approval | undefined => (APPROVALS as readonly string[]).includes(v ?? "") ? (v as Approval) : undefined;

/** A link's second line wherever links are listed (CP-53): the machine's says it waits for a person; it is shown, never hidden. */
export function linkLine(o: Origin | null | undefined): string | undefined {
  if (o === "machine") return "Linked by the machine · to approve";
  if (o === "person") return "Linked by a person";
  if (o === "sheet") return "From the sheet";
  return undefined;
}
