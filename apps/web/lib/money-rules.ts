import { EngineDown, engineSend } from "./engine";

// The money rules as the Rules screen reads and changes them (CP-80). Every check, the history in words and the save are the engine's
// (routes/money_rules.py); the site draws what it answers. A role, a kind of claim and a limit are codes in the rules and are never shown:
// this file is where each becomes the school's words.

export type Tier = { up_to: number | null; by: string };
export type Route = { approve: string; pay: Tier[] };
export type Rules = {
  ladder: string[];
  can: Record<string, string>;
  kinds: Record<string, Route>;
  self_approval: boolean;
  limits: Record<string, number>;
};
export type Change = { version: number; on: string; by: string; reason: string | null; changes: string[] };
export type RulesView = { rules: Rules; categories: string[]; version: number; can_set: boolean; history: Change[] };

/** What the page sends back on Save: what the person was looking at (`version`) and every field they can change, as typed (a number is its text until
 *  it is sent, so a field can be empty while it is typed over). */
export type DraftRoute = { approve: string; pay: { up_to: string | null; by: string }[] };
export type Draft = {
  version: number;
  limits: Record<string, string>;
  kinds: Record<string, DraftRoute>;
  opsAbove: string | null;
  categories: string[];
  reason: string;
};

export const ROLE: Record<string, string> = { educator: "an educator", ops: "the operations lead", coordinator: "a coordinator", founder: "a founder" };
export const role = (code: string) => ROLE[code] ?? code.replace(/_/g, " ");
/** A role as a name on its own, in the ladder. */
export const roleName = (code: string) => role(code).replace(/^(an?|the) /, "").replace(/^./, (c) => c.toUpperCase());

/** The rules' own routes as the form holds them. */
export const draftKinds = (kinds: Rules["kinds"]): Draft["kinds"] =>
  Object.fromEntries(Object.entries(kinds).map(([k, r]) => [k, { approve: r.approve, pay: r.pay.map((t) => ({ by: t.by, up_to: t.up_to === null ? null : String(t.up_to) })) }]));

/** A kind of claim as the start of a sentence, and as a heading. */
export const KIND: Record<string, string> = { expense: "An expense", float_topup: "A float top-up", capex: "Equipment", event_budget: "An event budget" };
export const kind = (code: string) => KIND[code] ?? code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Each limit as a sentence with its number in it: `before`, the number (a rupee amount has `money`), then `after`. */
export type LimitLine = { key: string; before: string; money?: boolean; after: string };
export const LIMIT_GROUPS: { title: string; lines: LimitLine[] }[] = [
  {
    title: "Bills and payments",
    lines: [
      { key: "bill_missing_hours", before: "Flag a bill still missing after", after: "hours" },
      { key: "screenshot_limit", before: "Take a payment screenshot as the bill up to", money: true, after: "" },
      { key: "repeat_item_days", before: "Flag the same item bought again within", after: "days" },
    ],
  },
  {
    title: "Deadlines",
    lines: [
      { key: "advance_unsettled_days", before: "Flag an advance not settled after", after: "days" },
      { key: "unpaid_after_approval_days", before: "Flag an approved claim not paid after", after: "days" },
      { key: "report_day", before: "Make the monthly report on day", after: "of the month" },
    ],
  },
  {
    title: "Equipment and stock",
    lines: [
      { key: "capex_floor", before: "A purchase above", money: true, after: "counts as equipment" },
      { key: "capex_min_life_months", before: "Equipment must last at least", after: "months" },
      { key: "stock_line", before: "The stock line is", money: true, after: "" },
    ],
  },
];

/** The ladder with the operations lead just above `above`; the others keep their order. */
export function ladderWith(ladder: string[], above: string): string[] {
  const others = ladder.filter((r) => r !== "ops");
  const i = others.indexOf(above);
  return i < 0 ? ladder : [...others.slice(0, i + 1), "ops", ...others.slice(i + 1)];
}
/** The role the operations lead sits just above now, or null when the school has none or it is the lowest. */
export function opsAboveOf(ladder: string[]): string | null {
  const i = ladder.indexOf("ops");
  return i > 0 ? ladder[i - 1] : null;
}

/** The rules as they were, with what the person changed laid over them; what the screen does not show stays as it was. A blank or unreadable limit goes
 *  as `null`, and the engine says in words that it must be a number. */
export function rulesFrom(now: Rules, d: Draft): Rules {
  const number = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
  return {
    ...now,
    ladder: d.opsAbove ? ladderWith(now.ladder, d.opsAbove) : now.ladder,
    kinds: Object.fromEntries(
      Object.entries(now.kinds).map(([k, route]) => {
        const mine = d.kinds[k];
        return [k, mine ? { approve: mine.approve, pay: mine.pay.map((t) => ({ by: t.by, up_to: t.up_to === null ? null : number(t.up_to) })) } : route];
      }),
    ),
    limits: { ...now.limits, ...Object.fromEntries(Object.entries(d.limits).map(([k, s]) => [k, number(s)])) } as Rules["limits"],
  };
}

/** The rules, categories and history, or an EngineDown that says why not. `history: false` is for a page that wants only `can_set` (no names are read). */
export async function rulesOf(email: string, history = true): Promise<RulesView> {
  const res = await engineSend("/money/rules/get", { actor: email, history });
  if (!res.ok) throw new EngineDown(await refusal(res, `The engine refused that (${res.status}).`));
  return (await res.json()) as RulesView;
}

/** Whether this person may change the rules (the Setup card is theirs). A page that cannot ask draws without the card. */
export async function maySetMoneyRules(email: string): Promise<boolean> {
  try {
    return (await rulesOf(email, false)).can_set;
  } catch (e) {
    if (e instanceof EngineDown) return false;
    throw e;
  }
}

/** The engine's own words for a refusal, or ours when it said none. */
export async function refusal(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
  return typeof body.detail === "string" ? body.detail : fallback;
}

/** "19 Nov", and the year when it is not this one. */
export function dayWords(on: string): string {
  const d = new Date(`${on}T00:00:00Z`);
  const year = d.getUTCFullYear() === new Date().getUTCFullYear() ? {} : { year: "numeric" as const };
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC", ...year });
}
