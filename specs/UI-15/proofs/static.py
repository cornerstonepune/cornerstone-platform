"""UI-15 proofs read from the repository (no database, no network).

  static.py no-role-names    3: no role or group name is written into the site's code by this change
  static.py next-version     4: package.json and the lockfile carry a `next` at least the version docs/notes/UI-15.md records
  static.py self-check       4: the version test fails when the lockfile's `next` is lower than the recorded one
  static.py frozen           5: `ux.frozen` in workflows.json has not grown against main
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps/web"
NOTES = ROOT / "docs/notes/UI-15.md"
# the first fixed 16.x version both advisories name (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr; design.md)
ADVISORY_FIXED = "16.4.1"
# the role and group codes of the access groups (supabase/migrations/20270120100000_access_groups_and_rules.sql)
NAMES = ("coordinator", "deputy_coordinator", "mentor", "head", "curriculum_team", "ops", "special_educator",
         "educator", "class_teacher", "subject_educator", "cover_educator", "specialist", "assistant",
         "everything", "own_classes")


def git(*args: str) -> str:
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=True).stdout


def base() -> str:
    return git("merge-base", "origin/main", "HEAD").strip()


def ver(text: str) -> tuple:
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", text or "")
    if not m:
        raise SystemExit(f"no version in {text!r}")
    return tuple(int(x) for x in m.groups())


def no_role_names() -> int:
    paths = ["apps/web/app", "apps/web/lib"]
    added = [l[1:] for l in git("diff", base(), "--", *paths).splitlines() if l.startswith("+") and not l.startswith("+++")]
    for f in git("ls-files", "--others", "--exclude-standard", "--", *paths).split():
        added += (ROOT / f).read_text().splitlines()
    pat = re.compile(r"""["'`](%s)["'`]""" % "|".join(NAMES))
    bad = [l.strip() for l in added if pat.search(l)]
    for l in bad:
        print(f"a role or group name is written into the code: {l}")
    return 1 if bad else 0


def recorded() -> tuple:
    if not NOTES.exists():
        raise SystemExit(f"{NOTES.relative_to(ROOT)} does not exist: the advisory text and the version chosen are not recorded")
    text = NOTES.read_text()
    for ghsa in ("GHSA-2464-fhr4-w9xw", "GHSA-673q-mjm6-r5xr"):
        if ghsa not in text:
            raise SystemExit(f"docs/notes/UI-15.md does not record the advisory {ghsa}")
    m = re.search(r"version chosen\W*(\d+\.\d+\.\d+)", text, re.I)
    if not m:
        raise SystemExit("docs/notes/UI-15.md has no line 'Version chosen: X.Y.Z'")
    return ver(m.group(1))


def version_problems(want: tuple, package: dict, lock: dict) -> list:
    out = []
    if want < ver(ADVISORY_FIXED):
        out.append(f"the recorded version {want} is below the advisories' fixed {ADVISORY_FIXED}")
    declared = package.get("dependencies", {}).get("next") or package.get("devDependencies", {}).get("next")
    if not declared or ver(declared) < want:
        out.append(f"apps/web/package.json declares next {declared}, below {'.'.join(map(str, want))}")
    locked = lock.get("packages", {}).get("node_modules/next", {}).get("version")
    if not locked or ver(locked) < want:
        out.append(f"apps/web/package-lock.json locks next {locked}, below {'.'.join(map(str, want))}")
    return out


def next_version() -> int:
    want = recorded()
    probs = version_problems(want, json.loads((WEB / "package.json").read_text()),
                             json.loads((WEB / "package-lock.json").read_text()))
    for p in probs:
        print(p)
    if not probs:
        print(f"next is at least {'.'.join(map(str, want))} in package.json and the lockfile")
    return 1 if probs else 0


def self_check() -> int:
    want = (16, 4, 5)
    ok = {"dependencies": {"next": "16.4.5"}}, {"packages": {"node_modules/next": {"version": "16.4.5"}}}
    low = {"dependencies": {"next": "16.4.5"}}, {"packages": {"node_modules/next": {"version": "16.4.4"}}}
    old = {"dependencies": {"next": "16.3.5"}}, {"packages": {"node_modules/next": {"version": "16.3.5"}}}
    assert not version_problems(want, *ok), "the test refuses a lockfile at the recorded version"
    assert version_problems(want, *low), "the test passes a lockfile below the recorded version"
    assert version_problems(want, *old), "the test passes next 16.3.5"
    assert version_problems((16, 4, 0), *ok), "the test passes a recorded version below the advisories' fix"
    print("the version test fails on a lower lockfile and passes on the recorded one")
    return 0


def frozen() -> int:
    now = json.loads((ROOT / "workflows.json").read_text())["ux"]["frozen"]
    was = json.loads(git("show", "origin/main:workflows.json"))["ux"]["frozen"]
    grown = {k: sorted(set(v) - set(was.get(k, []))) for k, v in now.items() if set(v) - set(was.get(k, []))}
    if grown:
        print(f"ux.frozen has grown against main: {grown}")
    return 1 if grown else 0


if __name__ == "__main__":
    sys.exit({"no-role-names": no_role_names, "next-version": next_version, "self-check": self_check,
              "frozen": frozen}[sys.argv[1]]())
