import { redirect } from "next/navigation";
import Link from "@/components/link";
import { BareFrame } from "@/components/app-frame";
import { currentStaff } from "@/lib/auth";
import { askForLink } from "@/lib/password-actions";
import { SAME_EITHER_WAY } from "@/lib/password-links";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// "Forgot your password?" (goals/auth-email-password.yaml). One field, and one answer whichever email is typed: a
// staff email and an email nobody holds read the same and take the same time, so the form cannot be used to find out
// who works here.
export default async function ForgotPage({ searchParams }: Props) {
  if (await currentStaff()) redirect("/");
  const q = await searchParams;

  return (
    <BareFrame>
      <h1 className="text-[26px] leading-tight">Forgot your password</h1>
      <p className="mt-2 text-[13.5px] text-basalt/62">
        Type your school email. We send a link that lets you set a new password.
      </p>
      <div className="chalkline" />

      {q.sent ? (
        <p className="mt-6 border border-neem/30 bg-neem/10 p-3 text-[13.5px]" role="status">
          {SAME_EITHER_WAY}. It works once and runs out in an hour. Look in your junk mail too.
        </p>
      ) : (
        <form action={askForLink} className="mt-6 grid gap-4">
          <label className="field">
            <span className="label">School email</span>
            <input className="input" type="email" name="email" autoComplete="username" required />
          </label>
          <button className="btn" type="submit">
            Send me a link
          </button>
        </form>
      )}

      <p className="mt-6 text-[13.5px]">
        <Link href="/login" className="underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </BareFrame>
  );
}
