// Money words, in one place (CP-80): the screens say an amount, a status and a date the same way.

/** ₹ with Indian grouping and two decimals: 450000 → "₹4,50,000.00". The engine sends money as a string with two decimals. */
export function rupees(amount: string | number): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "₹0.00";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type ClaimStatus = "submitted" | "sent back" | "approved" | "paid" | "withdrawn" | "voided";

/** The one chip word of a status, and the work state it is drawn in (components/status-chip.tsx STATES: green done, amber waiting, red a fix, grey to do). */
export const STATUS_WORDS: Record<ClaimStatus, { words: string; tone: "done" | "waiting" | "fix" | "quiet" }> = {
  submitted: { words: "Submitted", tone: "waiting" },
  "sent back": { words: "Sent back", tone: "fix" },
  approved: { words: "Approved", tone: "waiting" },
  paid: { words: "Paid", tone: "done" },
  withdrawn: { words: "Withdrawn", tone: "quiet" },
  voided: { words: "Voided", tone: "quiet" },
};

export type Claim = {
  id: string;
  amount: string;
  spent_on: string;
  vendor: string;
  category: string;
  campus: string;
  status: ClaimStatus;
  reason: string | null;
  paid_on: string | null;
  payment_ref: string | null;
  has_bill: boolean;
  next: string;
};
export type Waiting = Claim & { claimant: string; note: string | null };

export type MoneyAccess = {
  can: { approve: boolean; pay: boolean; set_rules: boolean };
  campuses: string[];
  counts: { approve: number; pay: number };
};
