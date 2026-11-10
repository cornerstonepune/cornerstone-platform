import { redirect } from "next/navigation";
import Link from "@/components/link";
import { currentStaff } from "@/lib/auth";
import { signIn } from "@/lib/auth-actions";
import { BareFrame } from "@/components/app-frame";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  if (await currentStaff()) redirect("/");
  const q = await searchParams;

  return (
    <BareFrame>
      <h1 className="text-[26px] leading-tight">Sign in</h1>
      <p className="mt-2 text-[13.5px] text-basalt/62">Staff only.</p>
      <div className="chalkline" />

      {q.error === "denied" ? (
        <p className="mt-6 border border-terracotta/30 bg-terracotta/10 p-3 text-[13.5px]" role="alert">
          That email and password do not match a staff member.
        </p>
      ) : null}
      {q.error === "wait" ? (
        <p className="mt-6 border border-terracotta/30 bg-terracotta/10 p-3 text-[13.5px]" role="alert">
          Too many wrong passwords for that email. Wait a few minutes, then try again.
        </p>
      ) : null}

      <form action={signIn} className="mt-6 grid gap-4">
        <label className="field">
          <span className="label">School email</span>
          <input className="input" type="email" name="email" autoComplete="username" required />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input className="input" type="password" name="password" autoComplete="current-password" required />
        </label>
        <button className="btn" type="submit">
          Sign in
        </button>
      </form>

      <p className="mt-6 text-[13.5px]">
        <Link href="/login/forgot" className="underline-offset-2 hover:underline">
          Forgot your password?
        </Link>
      </p>
    </BareFrame>
  );
}
