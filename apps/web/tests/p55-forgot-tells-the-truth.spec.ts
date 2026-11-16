/**
 * CP-55 — "Forgot your password" tells the truth. Live had none of the five SMTP_* settings, so every reset link since
 * 28 Oct 2026 was recorded `password_link.mail = 'not configured'` and never sent, while the page said a link had been
 * sent: a member of staff waited for an email that could not come. Now, when the site cannot send email, the page says
 * so and sends the person to the coordinator — and still never tells a staff email from anyone else's, because what it
 * says depends on the deployment alone (`mailConfigured`), never on the email typed.
 *
 * The browser run's own website has a sender (playwright.config.ts), so its page shows the sent-a-link answer
 * (gate-password.spec.ts); the no-sender answer is held here, on the two functions the page reads.
 */
import { expect, test } from "@playwright/test";
import { mailConfigured } from "../lib/mail";
import { forgotAnswer, NO_MAIL, SAME_EITHER_WAY } from "../lib/password-links";

const SMTP = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const;

test("5. with no sender set up, the site knows it cannot send email; with all five settings, it can", () => {
  const had = Object.fromEntries(SMTP.map((k) => [k, process.env[k]]));
  try {
    for (const k of SMTP) delete process.env[k];
    expect(mailConfigured()).toBe(false);
    Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: "2525", SMTP_USER: "u", SMTP_PASSWORD: "p", SMTP_FROM: "a@b.test" });
    expect(mailConfigured()).toBe(true);
    delete process.env.SMTP_FROM; // any one missing is no sender
    expect(mailConfigured()).toBe(false);
  } finally {
    for (const k of SMTP) {
      if (had[k] === undefined) delete process.env[k];
      else process.env[k] = had[k];
    }
  }
});

test("6. with no sender, the page says email is not set up and to ask the coordinator, never that a link was sent", () => {
  const said = forgotAnswer(false);
  expect(said).toContain(NO_MAIL);
  expect(said).toMatch(/not set up/);
  expect(said).toMatch(/coordinator/);
  expect(said).not.toContain(SAME_EITHER_WAY);
  expect(said).not.toMatch(/we have sent/i);
});

test("7. the answer is asked nothing about the email typed, so a staff email and anyone else's read the same", () => {
  // one argument, the deployment's fact: there is no way for the email to reach the words
  expect(forgotAnswer.length).toBe(1);
  expect(forgotAnswer(true)).toContain(SAME_EITHER_WAY);
  expect(forgotAnswer(true)).not.toContain(NO_MAIL);
});
