#!/usr/bin/env python3
"""CP-21 proofs for .claude/athena/preflight.sh. Standard library only, fake data, no database, no browser.

  preflight.py runs        # 3: exists, portable, passes when all pass, non-zero when a guard test or a listed spec fails
  preflight.py page-limit  # 4: prints each page's seconds; a page over the limit (3 s by default) fails it

The interface the preflight must have (the builder follows it; defaults are the real run):
  PREFLIGHT_GUARD_CMD           replaces the command that runs the guard tests (run from the repo root)
  PREFLIGHT_SPECS               the list of browser specs; default .claude/athena/preflight-specs.txt, one path per line,
                                relative to apps/web (e.g. tests/gate.spec.ts); blank lines and # comments ignored
  PREFLIGHT_PLAYWRIGHT_CMD      replaces the browser run: run from apps/web with each listed spec appended as an argument.
                                When it is set the preflight prepares no database and starts no server.
  PREFLIGHT_TIMINGS             set BY the preflight for the browser run: a file the run appends one line per page to,
                                `<page>\t<seconds>`; the preflight prints each page's seconds from it
  PREFLIGHT_PAGE_LIMIT_SECONDS  the page limit, default 3; a page over it fails the preflight and is named
Here both commands are stubs in a scratch folder; their exit codes and page timings are set per run.
"""

import os
import re
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PREFLIGHT = ROOT / ".claude/athena/preflight.sh"
DEFAULT_LIST = ROOT / ".claude/athena/preflight-specs.txt"
FAKE_SPECS = ["tests/cp21-fake-one.spec.ts", "tests/cp21-fake-two.spec.ts"]
FAILED = []


def ok(cond, msg):
    if not cond:
        FAILED.append(msg)
    return cond


def done():
    for m in FAILED:
        print("FAIL:", m)
    sys.exit(1 if FAILED else 0)


def script(path, body):
    path.write_text("#!/usr/bin/env bash\n" + body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def run(guard_rc=0, browser_rc=0, timings=(("/login", 1.2),), limit=None):
    """Run the preflight with stub commands. Returns (exit code, output, args the browser stub got or None)."""
    with tempfile.TemporaryDirectory(prefix="cp21-") as tmp:
        tmp = Path(tmp)
        lst, args = tmp / "specs.txt", tmp / "browser-args"
        lst.write_text("\n".join(FAKE_SPECS) + "\n")
        script(tmp / "guard", f'echo "cp21 stub: guard tests ran"\nexit {guard_rc}\n')
        lines = "".join(f"printf '%s\\t%s\\n' '{p}' '{s}' >> \"$PREFLIGHT_TIMINGS\"\n" for p, s in timings)
        script(tmp / "browser",
               f'printf "%s\\n" "$@" > "{args}"\necho "cp21 stub: browser specs ran in $(basename "$PWD")"\n'
               '[ -n "${PREFLIGHT_TIMINGS:-}" ] || { echo "cp21 stub: PREFLIGHT_TIMINGS not set"; exit 9; }\n'
               f"{lines}exit {browser_rc}\n")
        env = {k: v for k, v in os.environ.items()
               if not k.startswith("PREFLIGHT_") and k not in ("DATABASE_URL", "TEST_DATABASE_URL",
                                                              "TEST_WEB_DATABASE_URL", "TEST_ENGINE_DATABASE_URL")}
        env.update(PREFLIGHT_GUARD_CMD=str(tmp / "guard"), PREFLIGHT_PLAYWRIGHT_CMD=str(tmp / "browser"),
                   PREFLIGHT_SPECS=str(lst))
        if limit is not None:
            env["PREFLIGHT_PAGE_LIMIT_SECONDS"] = str(limit)
        p = subprocess.run(["bash", str(PREFLIGHT)], cwd=tmp, env=env, capture_output=True, text=True, timeout=110)
        got = args.read_text().split("\n") if args.exists() else None
        return p.returncode, p.stdout + p.stderr, got


def show(title, rc, out):
    print(f"--- {title} (exit {rc}):\n{out.rstrip()}\n")


def present():
    if not ok(PREFLIGHT.is_file(), ".claude/athena/preflight.sh does not exist"):
        return False
    ok(os.access(PREFLIGHT, os.X_OK), "preflight.sh is not executable")
    return True


def runs():
    if not present():
        return
    # its list: present, not empty, and every listed spec exists
    if ok(DEFAULT_LIST.is_file(), "the list of browser specs .claude/athena/preflight-specs.txt does not exist"):
        listed = [ln.strip() for ln in DEFAULT_LIST.read_text().splitlines() if ln.strip() and not ln.strip().startswith("#")]
        ok(listed, "the list of browser specs is empty")
        for s in listed:
            ok((ROOT / "apps/web" / s).is_file(), f"listed spec {s} is not a file under apps/web")
    # runs on the Mac too: its /bin/bash is 3.2 and its tools are BSD's
    text = PREFLIGHT.read_text()
    for pat, why in [(r"\b(mapfile|readarray)\b", "bash 4 only"), (r"(declare|local|typeset)\s+-A\b", "bash 4 only"),
                     (r"\$\{\w+(,,|\^\^)\}", "bash 4 only"), (r"readlink\s+-f\b", "GNU only"),
                     (r"grep\s+(-\w*P|--perl)", "GNU only"), (r"sed\s+-i(\s|$)", "GNU and BSD differ"),
                     (r"date\s+\+%[^ ]*N", "GNU only"), (r"stat\s+-c\b", "GNU only"), (r"(^|[;&|(]\s*)timeout\s", "not on a Mac")]:
        ok(not re.search(pat, text, re.M), f"preflight.sh uses something that does not run on the Mac ({why}): {pat}")

    rc, out, got = run()
    show("passing run", rc, out)
    ok(rc == 0, "the preflight fails when the guard tests and every listed spec pass")
    ok("cp21 stub: guard tests ran" in out, "the passing run did not run the guard tests (PREFLIGHT_GUARD_CMD)")
    ok(got is not None and all(any(s in a for a in got) for s in FAKE_SPECS),
       f"the browser run was not given every listed spec (PREFLIGHT_SPECS); it got {got}")
    ok("browser specs ran in web" in out, "the browser run did not run from apps/web")

    rc, out, _ = run(guard_rc=1)
    show("a guard test fails", rc, out)
    ok(rc != 0, "the preflight exits 0 when a guard test fails")

    rc, out, _ = run(browser_rc=1)
    show("a listed browser spec fails", rc, out)
    ok(rc != 0, "the preflight exits 0 when a listed browser spec fails")


def seconds_shown(out, page, secs):
    return any(page in ln and any(abs(float(x) - secs) < 0.06 for x in re.findall(r"\d+(?:\.\d+)?", ln.replace(page, "")))
               for ln in out.splitlines())


def page_limit():
    if not present():
        return
    pages = (("/login", 1.2), ("/cp21-fake-papers", 2.9))
    rc, out, _ = run(timings=pages)
    show("pages under the default limit", rc, out)
    ok(rc == 0, "the preflight fails with every page under 3 s and no limit set")
    for p, s in pages:
        ok(seconds_shown(out, p, s), f"the preflight did not print {p} with its {s} seconds")

    rc, out, _ = run(timings=(("/login", 1.2), ("/cp21-fake-slow", 3.1)))
    show("a page over the default limit of 3 s", rc, out)
    ok(rc != 0, "the preflight passes with a page at 3.1 s and the default limit (it must be 3 s)")
    ok(seconds_shown(out, "/cp21-fake-slow", 3.1), "the failing run did not print the slow page with its seconds")

    rc, out, _ = run(timings=(("/login", 1.2), ("/cp21-fake-quick", 0.4)), limit=1)
    show("limit set to 1 s, below /login's 1.2 s", rc, out)
    ok(rc != 0, "the preflight passes when PREFLIGHT_PAGE_LIMIT_SECONDS=1 and a page took 1.2 s")
    ok(seconds_shown(out, "/login", 1.2), "the failing run did not print /login with its 1.2 seconds")


if __name__ == "__main__":
    {"runs": runs, "page-limit": page_limit}[sys.argv[1]]()
    done()
