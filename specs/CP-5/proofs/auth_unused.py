"""CP-5 item 3: a recorded decision says leaked-password protection does not apply, because Supabase Auth is not
used for sign-in, and nothing in the repository reads Supabase Auth's user table.

The decision is expected at docs/adr/NNNN-leaked-password-protection-does-not-apply.md (any number; docs/decisions/
is accepted too): one tracked file whose name holds "leaked-password".
"""

import re
import subprocess
import sys

# Ways code reaches Supabase Auth's user table: SQL on auth.users, supabase-js's admin and getUser calls,
# GoTrue's user and admin endpoints.
READS_AUTH_USERS = re.compile(
    r"\bauth\s*\.\s*users\b|\"auth\"\s*\.\s*\"users\"|\.auth\s*\.\s*admin\b|\.auth\s*\.\s*getUser\s*\(|/auth/v1/(user|admin)\b",
    re.I,
)
PROSE = ("docs/", "specs/", "goals/")  # explanation, not code: an ADR may say what a uuid once pointed at


def tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files", "-z"], capture_output=True, check=True).stdout.decode()
    return [p for p in out.split("\0") if p]


def main() -> int:
    files = tracked()
    problems = []

    decisions = [p for p in files if re.match(r"docs/(adr|decisions)/[^/]*leaked-password[^/]*\.md$", p)]
    if len(decisions) != 1:
        problems.append(f"expected one tracked decision docs/adr/*leaked-password*.md, found {len(decisions)}")
    else:
        text = open(decisions[0], encoding="utf-8").read()
        for need, why in (
            (r"leaked[- ]password", "names leaked-password protection"),
            (r"Supabase Auth", "names Supabase Auth"),
            (r"does not apply|not applicable", "says it does not apply"),
            (r"sign[- ]in", "gives the reason: sign-in is not Supabase Auth's"),
        ):
            if not re.search(need, text, re.I):
                problems.append(f"{decisions[0]} does not say what it must: {why}")

    for path in files:
        if path.startswith(PROSE) or path.endswith(".md"):
            continue
        try:
            text = open(path, "rb").read().decode("utf-8", errors="ignore")
        except (IsADirectoryError, FileNotFoundError):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if READS_AUTH_USERS.search(line):
                problems.append(f"{path}:{n} reads Supabase Auth's user table")

    print("\n".join(problems) or "decision recorded; nothing reads Supabase Auth's user table")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
