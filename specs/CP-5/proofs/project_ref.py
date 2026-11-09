"""CP-5 item 4: the live project reference appears in no tracked file.

The reference itself is never written here. It is read from SUPABASE_PROJECT_REF when set; a generic pattern also
finds any bare 20-lowercase-letter Supabase reference written beside `.supabase.`, `project`, `ref` or `postgres`
(`<ref>.supabase.co`, `postgres.<ref>`, `--project-ref <ref>`, `PROJECT_REF=<ref>`, "hosted project `<ref>`",
"Supabase Postgres (`<ref>`"). Hits are reported as file:line only, never the matched text.
"""

import os
import re
import subprocess
import sys

PATTERN = re.compile(
    r"(?<![a-z0-9])[a-z]{20}\.supabase\."                                # <ref>.supabase.co / .com / .in
    r"|(?i:project|postgres|ref)[^A-Za-z0-9_\n]{1,4}[a-z]{20}(?![a-z0-9])"  # project `<ref>`, postgres.<ref>, --project-ref <ref>
)

# Self-check on a made-up reference, built at run time so this file never holds one.
_FAKE = "q" * 20
for _hit in (f"https://{_FAKE}.supabase.co", f"postgres.{_FAKE}", f"--project-ref {_FAKE}", f"PROJECT_REF={_FAKE}",
             f"hosted project `{_FAKE}` (ap-south-1)", f"Supabase Postgres (`{_FAKE}`", f"(ref `{_FAKE}`, x)"):
    assert PATTERN.search(_hit), _hit
for _miss in ("project `<project-ref>`", f"{_FAKE}x.supabase.co", f"ref {_FAKE}1", "internationalization"):
    assert not PATTERN.search(_miss), _miss


def main() -> int:
    named = os.environ.get("SUPABASE_PROJECT_REF", "").strip()
    files = subprocess.run(["git", "ls-files", "-z"], capture_output=True, check=True).stdout.decode().split("\0")
    hits = []
    for path in filter(None, files):
        try:
            with open(path, "rb") as f:
                text = f.read().decode("utf-8", errors="ignore")
        except (IsADirectoryError, FileNotFoundError):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if PATTERN.search(line) or (named and named in line):
                hits.append(f"{path}:{n}")
    if hits:
        print(f"the live project reference is in {len(hits)} tracked line(s):")
        print("\n".join(hits[:40]))
        return 1
    print("no tracked file holds a Supabase project reference")
    return 0


if __name__ == "__main__":
    sys.exit(main())
