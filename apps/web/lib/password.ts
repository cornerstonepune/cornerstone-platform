import common from "../../../supabase/seed/common_passwords.json";
import { hashPassword, scryptCost } from "./auth";
import { sql, TENANT_SLUG } from "./db";
import { closeLinks } from "./password-links";

// What makes a new password good enough (goals/auth-email-password.yaml). The length is a setting and the list of
// the commonest passwords is a seed file, so neither is a number or a list inside code (rule 1). Three rules, no more:
// Nimish, 26 Oct 2026, "keep it simple" — no character classes, no expiry, no history.
const COMMON = new Set(common.passwords.map((p) => p.toLowerCase()));

/** Why this password cannot be used, in the words the person reads, or null when it can. */
export async function passwordProblem(password: string, email: string): Promise<string | null> {
  const [row] = await sql<{ least: number }[]>`
    select (select value::numeric from config where key = 'password.min_length')::int as least`;
  const least = row?.least ?? 10;
  if (password.length < least) return `Use at least ${least} characters.`;
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) {
    return "That is your email address. Use something else.";
  }
  if (COMMON.has(password.toLowerCase())) return "That password is one of the most common ones. Use another.";
  return null;
}

/** Gives this person their new password and ends every session of theirs that is already open: their `pii.staff` row
 *  carries the hash `lib/auth.ts` checks and the moment it was set (this server's clock, which its cookies carry), which
 *  no cookie made before it survives (`currentStaff`). One statement, through the one function the website may write
 *  it with (`staff_set_password`); it touches nothing else of the person. Their open links are closed too, used or not. */
export async function setPassword(email: string, password: string): Promise<void> {
  const hash = hashPassword(password, await scryptCost());
  await sql`select public.staff_set_password(${TENANT_SLUG}, ${email.toLowerCase()}, ${hash}, ${new Date().toISOString()}::timestamptz)`;
  await closeLinks(email);
}
