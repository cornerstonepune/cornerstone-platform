import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { BareFrame } from "@/components/app-frame";
import { Form } from "@/components/form";
import { Notice } from "@/components/parts";
import { currentStaff } from "@/lib/auth";
import { signIn } from "@/lib/auth-actions";
import { sql } from "@/lib/db";
import { askForLink, setNewPassword } from "@/lib/password-actions";
import { emailFor, LINK_COOKIE, SAME_EITHER_WAY } from "@/lib/password-links";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// Sign in (UI-12): one page, three views of the same bare frame. The default is the sign-in form; `view=forgot` is "Forgot your password?"
// (the tab beside it) and `view=new-password` is where an emailed link leads. Behaviour is the sign-in's of goals/auth-email-password.yaml,
// unchanged: one answer whichever email is typed, a link that works once, and the token never in the address (it is in a cookie).
// A person already signed in is sent on, except to ask for a link, which is how a signed-in person changes their password.
export default async function LoginPage({ searchParams }: Props) {
  const q = await searchParams;
  const view = q.view === "forgot" || q.view === "new-password" ? q.view : "sign-in";
  if (view === "sign-in" && (await currentStaff())) redirect("/today");
  const token = view === "new-password" ? ((await cookies()).get(LINK_COOKIE)?.value ?? "") : "";
  const email = view === "new-password" && q.error !== "gone" ? await emailFor(token) : null;
  const [row] = view === "new-password" ? await sql<{ least: number }[]>`select (select value::numeric from config where key = 'password.min_length')::int as least` : [];

  const [eyebrow, title, purpose] =
    view === "new-password"
      ? ["Staff only", "Set a new password", email ? `For ${email}. At least ${row?.least ?? 10} characters, and not your email address.` : "A link sets a new password once."]
      : view === "forgot"
        ? ["Staff only", "Forgot your password", "Type your school email. We send a link that lets you set a new password."]
        : ["Staff only", "Sign in", "School email and password. Forgot it: a link by email, set by its owner."];

  return (
    <BareFrame>
      <p className="text-[length:var(--text-eyebrow)] text-[var(--ink-muted)] uppercase">{eyebrow}</p>
      <h1 className="text-[length:var(--text-title,26px)] leading-tight">{title}</h1>
      <p className="mt-2 mb-4 text-[length:var(--text-label)] text-[var(--ink-muted)]">{purpose}</p>

      {view !== "new-password" ? (
        <div className="b-seg mb-4" role="tablist" aria-label="Sign in or forgot">
          <a role="tab" aria-selected={view === "sign-in"} href="/login">
            Sign in
          </a>
          <a role="tab" aria-selected={view === "forgot"} href="/login?view=forgot">
            Forgot your password?
          </a>
        </div>
      ) : null}

      {view === "sign-in" ? (
        <>
          {q.error === "denied" ? <Notice tone="terracotta" alert>That email and password do not match a staff member.</Notice> : null}
          {q.error === "wait" ? <Notice tone="terracotta" alert>Too many wrong passwords for that email. Wait a few minutes, then try again.</Notice> : null}
          <Form
            action={signIn}
            submit="Sign in"
            main
            fields={[
              { name: "email", label: "School email", type: "email", autoComplete: "username", required: true },
              { name: "password", label: "Password", type: "password", autoComplete: "current-password", required: true },
            ]}
          />
        </>
      ) : null}

      {view === "forgot" ? (
        q.sent ? (
          <Notice tone="neem">{SAME_EITHER_WAY}. It works once and runs out in an hour. Look in your junk mail too.</Notice>
        ) : (
          <Form action={askForLink} submit="Send me a link" main fields={[{ name: "email", label: "School email", type: "email", autoComplete: "username", required: true }]} />
        )
      ) : null}

      {view === "new-password" ? (
        email ? (
          <>
            {q.error === "match" ? <Notice tone="terracotta" alert>The two passwords are not the same.</Notice> : null}
            {q.problem ? <Notice tone="terracotta" alert>{q.problem}</Notice> : null}
            <Form
              action={setNewPassword}
              submit="Save it and sign in"
              main
              fields={[
                { name: "password", label: "New password", type: "password", autoComplete: "new-password", required: true },
                { name: "again", label: "The same password again", type: "password", autoComplete: "new-password", required: true },
              ]}
            />
          </>
        ) : (
          <Notice tone="terracotta" alert>That link no longer works. A link works once, runs out in an hour, and a newer one replaces it. Ask for a fresh one.</Notice>
        )
      ) : null}

      {view === "new-password" ? (
        <p className="mt-4 text-[length:var(--text-label)]">
          <a href="/login?view=forgot" className="underline">
            Send me another link
          </a>
        </p>
      ) : null}
    </BareFrame>
  );
}
