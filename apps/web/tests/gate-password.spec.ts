/**
 * Setting your own password, against a server with the development bypass off (goals/auth-email-password.yaml):
 * forgotten, emailed, set, signed in; a link that opens nothing a second time; a weak password refused; a session open
 * elsewhere signed out; a password changed by its owner; a new member of staff added with none.
 *
 * The emails are read from the run's own sender (tests/mail-server.ts). Every member of staff here is the test's own,
 * made in the local copy and taken off at the end.
 */
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { linkIn, mailFor, MAIL_WAIT_MS } from "./mail-server";
import { aPerson, forgetPerson, personAsStored } from "./rows";

// One connection, closed by the driver as soon as it is idle: a client held open across a whole file is ended by the
// first failure's teardown, and every test after it then reads "CONNECTION_ENDED" instead of its own result.
const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 2 });
const PASSWORD = "a-long-enough-one-1";

/** A member of staff of this test's own, with a password already set (as `engine set-password` sets one). */
async function staffMember(password: string | null = PASSWORD, role = "educator"): Promise<string> {
  const email = `pw-${randomUUID().slice(0, 8)}@cornerstone.test`;
  await aPerson(sql, { email, name: "Password test", role, ...(password ? { password } : {}) });
  return email;
}

// Every ask of this run's is cleared first: the limit per address counts them all, and nothing else writes to the copy.
test.beforeEach(async () => {
  await sql`delete from password_ask`;
});

async function forget(email: string): Promise<void> {
  await forgetPerson(sql, email);
  await sql`delete from password_link where email = ${email}`;
  await sql`delete from password_ask where email = ${email}`;
}

/** The link the newest email to that address carries, once it arrives. `seen` is how many that address already had,
 *  so asking twice waits for the second email rather than reading the first one again. */
async function linkSentTo(email: string, seen = 0): Promise<string> {
  await expect.poll(() => mailFor(email).length, { timeout: 15_000 }).toBeGreaterThan(seen);
  const mail = mailFor(email);
  return linkIn(mail[mail.length - 1]);
}

async function askForALink(page: Page, email: string): Promise<void> {
  await page.goto("/login?view=forgot");
  await page.getByLabel("School email").fill(email);
  await page.getByRole("button", { name: "Send me a link" }).click();
  await expect(page.getByRole("main")).toContainText("If that email is a staff email, we have sent a link");
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("School email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signed in, and on the page a person lands on: a sign-in that failed must say so here, not three steps later. */
async function signedIn(page: Page, email: string, password: string): Promise<void> {
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/today/);
}

test("the sign-in page offers the forgotten-password link and no longer sends anyone to Nimish", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("main")).not.toContainText("Ask Nimish");
  await page.getByRole("tab", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Forgot your password");
});

test("forgot your password says the same words for a staff email and for one that is nobody's", async ({ page }) => {
  const email = await staffMember();
  try {
    await askForALink(page, email);
    const said = await page.getByRole("main").innerText();
    await askForALink(page, `nobody-${randomUUID().slice(0, 8)}@cornerstone.test`);
    expect(await page.getByRole("main").innerText()).toBe(said);
    // and only the staff email was written to
    expect(mailFor(email).length).toBeGreaterThan(0);
  } finally {
    await forget(email);
  }
});

test("a staff email and an unknown one are answered in the same time, so the wait never says who is staff", async ({ page }) => {
  const email = await staffMember();
  try {
    const timed = async (who: string) => {
      const at = Date.now();
      await askForALink(page, who);
      return Date.now() - at;
    };
    await timed(`warm-${randomUUID().slice(0, 8)}@cornerstone.test`); // the first page view builds; it is not timed
    const known = await timed(email);
    const unknown = await timed(`nobody-${randomUUID().slice(0, 8)}@cornerstone.test`);
    // the sender waits MAIL_WAIT_MS on purpose: a page that sent its email before answering would show it here
    expect(known - unknown).toBeLessThan(MAIL_WAIT_MS);
    await linkSentTo(email); // the email still goes, after the answer
  } finally {
    await forget(email);
  }
});

test("the emailed link sets a new password, which signs that person in", async ({ page }) => {
  const email = await staffMember(null);
  try {
    await askForALink(page, email);
    await page.goto(await linkSentTo(email));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Set a new password");
    // the token is gone from the address the moment it is used once
    expect(page.url()).not.toContain("token");
    await page.getByLabel("New password").fill("kolhapur-rain-9");
    await page.getByLabel("The same password again").fill("kolhapur-rain-9");
    await page.getByRole("button", { name: "Save it and sign in" }).click();
    await expect(page).toHaveURL(/\/today/);
    // and that is now the password the sign-in page takes
    await page.context().clearCookies();
    await signedIn(page, email, "kolhapur-rain-9");
  } finally {
    await forget(email);
  }
});

test("a link already used, and a link a newer one replaced, both open nothing", async ({ page }) => {
  const email = await staffMember(null);
  try {
    await askForALink(page, email);
    const first = await linkSentTo(email);
    await askForALink(page, email);
    const second = await linkSentTo(email, 1);
    expect(second).not.toBe(first);

    await page.goto(first);
    await expect(page.getByRole("main")).toContainText("That link no longer works");

    await page.goto(second);
    await page.getByLabel("New password").fill("satara-morning-4");
    await page.getByLabel("The same password again").fill("satara-morning-4");
    await page.getByRole("button", { name: "Save it and sign in" }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.context().clearCookies();

    await page.goto(second);
    await expect(page.getByRole("main")).toContainText("That link no longer works");
  } finally {
    await forget(email);
  }
});

test("a password too short, the person's own email, or a common one is refused", async ({ page }) => {
  const email = await staffMember(null);
  try {
    await askForALink(page, email);
    const link = await linkSentTo(email);
    for (const [weak, said] of [
      ["short-1", "at least"],
      [email, "your email address"],
      ["password123", "most common"],
    ] as const) {
      await page.goto(link);
      await page.getByLabel("New password").fill(weak);
      await page.getByLabel("The same password again").fill(weak);
      await page.getByRole("button", { name: "Save it and sign in" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText(said);
    }
    // and the link still works, because nothing was set
    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Set a new password");
  } finally {
    await forget(email);
  }
});

test("a session open elsewhere is signed out once the password is set", async ({ page, browser }) => {
  const email = await staffMember();
  try {
    await signedIn(page, email, PASSWORD);

    // the same person, signed in in another browser, forgets their password and sets a new one
    const other = await browser.newContext();
    const them = await other.newPage();
    await askForALink(them, email);
    await them.goto(await linkSentTo(email));
    await them.getByLabel("New password").fill("wardha-evening-7");
    await them.getByLabel("The same password again").fill("wardha-evening-7");
    await them.getByRole("button", { name: "Save it and sign in" }).click();
    await expect(them).toHaveURL(/\/today/);
    await other.close();

    // the first browser's session is over: it reads the sign-in page, not the site
    await page.goto("/today");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await forget(email);
  }
});

test("a signed-in person gets a link from their name in the bar, sets a new password with it, and the old one stops working", async ({ page }) => {
  const email = await staffMember();
  try {
    await signedIn(page, email, PASSWORD);
    // the person's own name in the bar, where Sign out is, leads to the form that sends the link
    await page.locator("[data-bar]").first().getByTestId("who").click();
    await expect(page).toHaveURL(/\/login\?view=forgot/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Forgot your password");
    await page.getByLabel("School email").fill(email);
    await page.getByRole("button", { name: "Send me a link" }).click();
    await expect(page.getByRole("main")).toContainText("If that email is a staff email, we have sent a link");
    await page.goto(await linkSentTo(email));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Set a new password");
    await page.getByLabel("New password").fill("amravati-gate-3");
    await page.getByLabel("The same password again").fill("amravati-gate-3");
    await page.getByRole("button", { name: "Save it and sign in" }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.context().clearCookies();
    await signIn(page, email, PASSWORD);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("do not match");
    await signedIn(page, email, "amravati-gate-3");
  } finally {
    await forget(email);
  }
});

test("past the limit on asks for one email the form sends nothing and still says what it always says", async ({ page }) => {
  const email = await staffMember();
  try {
    const [row] = await sql<{ most: number }[]>`
      select (select value::numeric from config where key = 'password_ask.max_per_email')::int as most`;
    for (let n = 0; n < row.most; n += 1) await askForALink(page, email);
    await linkSentTo(email);
    const sent = mailFor(email).length;
    await askForALink(page, email); // one past the limit: the same words, and no email
    await expect.poll(() => mailFor(email).length, { timeout: 3_000 }).toBe(sent);
  } finally {
    await forget(email);
  }
});

test("a new member of staff added on the Staff page has no password and is sent a first-time link", async ({ page }) => {
  const coordinator = await staffMember(PASSWORD, "coordinator"); // only the coordinators may add a member of staff
  const email = `new-${randomUUID().slice(0, 8)}@cornerstone.test`;
  try {
    await signedIn(page, coordinator, PASSWORD);
    await page.goto("/setup/staff"); // Staff and classes (UI-5): the old /staff page's Add a member of staff is Add a person here
    await page.getByRole("button", { name: "Add a person" }).click();
    const form = page.getByRole("form", { name: "Add a person" });
    await form.getByLabel("Name").fill("Newly added");
    await form.getByLabel("School email").fill(email);
    await form.getByRole("button", { name: "Add and send a link" }).click();
    await expect(page.getByRole("main")).toContainText("a link to set their own password is on its way");
    // nobody typed a password: the row holds none
    expect((await personAsStored(sql, email))?.password ?? null).toBeNull();

    await page.context().clearCookies();
    await page.goto(await linkSentTo(email));
    await page.getByLabel("New password").fill("beed-station-6");
    await page.getByLabel("The same password again").fill("beed-station-6");
    await page.getByRole("button", { name: "Save it and sign in" }).click();
    await expect(page).toHaveURL(/\/today/);
  } finally {
    await forget(email);
    await forget(coordinator);
  }
});
