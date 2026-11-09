#!/usr/bin/env python3
"""CP-20 proofs for .claude/athena/setup.sh. Standard library only, offline, no database.

setup.sh is run in a scratch copy of the repository with bin/ci-postgres, bin/testdb, uv and npm replaced by stubs that
only record their calls; a scratch file stands in for $GITHUB_ENV. Nothing is installed and no database is started.
  python3 specs/CP-20/proofs/setup_sh.py job        # 1: in the job, a local TEST_DATABASE_URL, any other host stops it
  python3 specs/CP-20/proofs/setup_sh.py no-dburl   # 2: DATABASE_URL is never set
  python3 specs/CP-20/proofs/setup_sh.py off-ci     # 3: outside the job no database is started, no variable set
  python3 specs/CP-20/proofs/setup_sh.py scope      # 5: the diff touches only setup.sh outside specs/CP-20/; time
"""

import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SETUP = ROOT / ".claude/athena/setup.sh"
LOCAL = "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
STUB_LOG_LINE = "cp20-stub-testdb: building"
FAILED = []


def ok(cond, msg):
    if not cond:
        FAILED.append(msg)
    return cond


def stub(path, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("#!/usr/bin/env bash\n" + body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def run_setup(github_actions, db_url=None, testdb_rc=0):
    """Run a copy of setup.sh with stubs. Returns (exit code, output, calls, GITHUB_ENV lines, seconds)."""
    tmp = Path(tempfile.mkdtemp(prefix="cp20-"))
    try:
        repo, fake = tmp / "repo", tmp / "fakebin"
        (repo / ".claude/athena").mkdir(parents=True)
        shutil.copy2(SETUP, repo / ".claude/athena/setup.sh")
        (repo / "packages/engine").mkdir(parents=True)
        (repo / "apps/web").mkdir(parents=True)
        calls, genv, gpath, rtemp = tmp / "calls", tmp / "github_env", tmp / "github_path", tmp / "runner"
        for f in (calls, genv, gpath):
            f.write_text("")
        rtemp.mkdir()
        rec = 'echo "$NAME $* | cwd=$(basename "$PWD") | DATABASE_URL=${DATABASE_URL-<unset>}" >> "$CP20_CALLS"\n'
        stub(repo / "bin/ci-postgres", "NAME=ci-postgres\n" + rec)
        stub(repo / "bin/testdb", "NAME=testdb\n" + rec + f'echo "{STUB_LOG_LINE}"\nsleep 1\nexit {testdb_rc}\n')
        stub(fake / "uv", "NAME=uv\n" + rec)
        stub(fake / "npm", "NAME=npm\n" + rec)
        env = {k: v for k, v in os.environ.items()
               if k not in ("GITHUB_ACTIONS", "DATABASE_URL", "TEST_DATABASE_URL", "CP20_TEST_DB_URL")}
        env.update(PATH=f"{fake}:{env.get('PATH', '/usr/bin:/bin')}", CP20_CALLS=str(calls), GITHUB_ENV=str(genv),
                   GITHUB_PATH=str(gpath), RUNNER_TEMP=str(rtemp))
        if github_actions is not None:
            env["GITHUB_ACTIONS"] = github_actions
        if db_url is not None:
            env["CP20_TEST_DB_URL"] = db_url
        t0 = time.monotonic()
        try:
            p = subprocess.run(["bash", str(repo / ".claude/athena/setup.sh")], cwd=str(tmp), env=env,
                               capture_output=True, text=True, timeout=20)
            code, out = p.returncode, p.stdout + p.stderr
        except subprocess.TimeoutExpired:
            code, out = "timeout", "setup.sh did not finish within 20 s with every command stubbed"
        secs = time.monotonic() - t0
        lines = [ln for ln in calls.read_text().splitlines() if ln.strip()]
        envlines = [ln for ln in genv.read_text().splitlines() if ln.strip()]
        return code, out, lines, envlines, secs
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def idx(calls, prefix):
    return next((i for i, c in enumerate(calls) if c.startswith(prefix)), None)


def db_calls(calls):
    return [c for c in calls if c.startswith(("ci-postgres", "testdb"))]


def show(label, r):
    code, out, calls, envlines, _ = r
    return f"[{label}] exit={code} calls={calls} GITHUB_ENV={envlines} output tail={out.strip()[-300:]!r}"


def job():
    r = run_setup("true")
    code, out, calls, envlines, _ = r
    ok(code == 0, f"in the job with every stub succeeding, setup.sh should exit 0. {show('default', r)}")
    iu, ic, it, inpm = (idx(calls, p) for p in ("uv sync", "ci-postgres", "testdb ", "npm ci"))
    ok(None not in (iu, ic, it, inpm),
       f"uv sync, bin/ci-postgres, bin/testdb and npm ci should all run in the job. {show('default', r)}")
    if None not in (iu, ic, it):
        ok(iu < ic < it, f"order should be uv sync, then bin/ci-postgres, then bin/testdb. {show('default', r)}")
    if it is not None:
        ok(calls[it].split(" | ")[0] == f"testdb fresh {LOCAL}",
           f"bin/testdb should be called as `fresh {LOCAL}`, got {calls[it]!r}")
    ok(envlines == [f"TEST_DATABASE_URL={LOCAL}"],
       f"GITHUB_ENV should get exactly TEST_DATABASE_URL={LOCAL}. {show('default', r)}")

    loc = "postgresql://postgres:postgres@localhost:5432/postgres"
    r = run_setup("true", db_url=loc)
    ok(r[0] == 0 and r[3] == [f"TEST_DATABASE_URL={loc}"],
       f"a localhost address should be accepted and written. {show('localhost', r)}")

    for remote in ("postgresql://postgres:pw@db.example.invalid:5432/postgres",
                   "postgresql://postgres:postgres@127.0.0.1.evil.example:5432/postgres"):
        r = run_setup("true", db_url=remote)
        code, out, calls, envlines, _ = r
        ok(code != 0, f"a non-local host should stop setup.sh with a non-zero exit. {show(remote, r)}")
        ok(not db_calls(calls), f"a non-local host should stop before bin/ci-postgres or bin/testdb runs. {show(remote, r)}")
        ok(not envlines, f"a non-local host should write nothing to GITHUB_ENV. {show(remote, r)}")
        ok(re.search(r"127\.0\.0\.1|localhost", out) is not None,
           f"the stop message should say the database must be on 127.0.0.1 or localhost. {show(remote, r)}")

    r = run_setup("true", testdb_rc=1)
    code, out, calls, envlines, _ = r
    ok(code == 1, f"bin/testdb failing (exit 1) should make setup.sh exit 1. {show('testdb fails', r)}")
    ok(not envlines, f"bin/testdb failing should write nothing to GITHUB_ENV. {show('testdb fails', r)}")
    ok(STUB_LOG_LINE in out, f"bin/testdb's log should be printed by setup.sh. {show('testdb fails', r)}")


def no_dburl():
    text = SETUP.read_text()
    assigns = [ln for ln in text.splitlines()
               if re.search(r"(^|[^A-Za-z0-9_])DATABASE_URL\s*[:+]?=", ln.split("#", 1)[0])
               or re.search(r"\b(export|declare|local|readonly)\b[^#]*[^A-Za-z0-9_]DATABASE_URL\b", ln.split("#", 1)[0])]
    ok(not assigns, f"setup.sh must not assign DATABASE_URL (TEST_DATABASE_URL only): {assigns}")
    r = run_setup("true")
    code, out, calls, envlines, _ = r
    ok(code == 0 and idx(calls, "testdb ") is not None,
       f"in the job setup.sh should build the database (else this proof proves nothing). {show('job', r)}")
    ok(not [e for e in envlines if re.match(r"\s*DATABASE_URL\s*=", e)],
       f"GITHUB_ENV must never get DATABASE_URL. {show('job', r)}")
    seen = [c for c in calls if not c.endswith("DATABASE_URL=<unset>")]
    ok(not seen, f"no command setup.sh starts may see DATABASE_URL: {seen}")


def off_ci():
    text = SETUP.read_text()
    ok("bin/testdb" in text and "GITHUB_ACTIONS" in text,
       "setup.sh has no GITHUB_ACTIONS-gated bin/testdb step yet, so 'starts no database off CI' is not yet a property "
       "of the feature")
    for ga in (None, "false"):
        label = f"GITHUB_ACTIONS={ga or '<unset>'}"
        r = run_setup(ga)
        code, out, calls, envlines, _ = r
        ok(code == 0, f"outside the job setup.sh should still succeed. {show(label, r)}")
        ok(not db_calls(calls), f"outside the job no database may be started. {show(label, r)}")
        ok(not envlines, f"outside the job nothing may be written to GITHUB_ENV. {show(label, r)}")
        ok(idx(calls, "uv sync") is not None and idx(calls, "npm ci") is not None,
           f"outside the job setup.sh should still install as today (uv sync, npm ci). {show(label, r)}")


SETUP_REL = ".claude/athena/setup.sh"


def extra_files(changed):
    """Files a setup.sh change may not touch: all but setup.sh, its note and specs/CP-20/."""
    allowed = {SETUP_REL, "docs/notes/CP-20.md"}
    return [f for f in changed if f not in allowed and not f.startswith("specs/CP-20/")]


def scope():
    base = os.environ.get("ATHENA_BASE") or "origin/main"
    mb = subprocess.run(["git", "merge-base", base, "HEAD"], cwd=ROOT, capture_output=True, text=True)
    if not ok(mb.returncode == 0, f"cannot find the merge base with {base}: {mb.stderr.strip()}"):
        return
    d = subprocess.run(["git", "diff", "--name-only", mb.stdout.strip()], cwd=ROOT, capture_output=True, text=True)
    changed = d.stdout.split()
    ok(extra_files([SETUP_REL, "apps/web/x.ts"]) == ["apps/web/x.ts"]
       and extra_files([SETUP_REL, "docs/notes/CP-20.md", "specs/CP-20/spec.md"]) == []
       and extra_files([]) == [], "extra_files self-check failed")
    if SETUP_REL in changed:
        extra = extra_files(changed)
        ok(not extra, f"tracked files changed against {base} outside specs/CP-20/, setup.sh and docs/notes/CP-20.md: {extra}")
    else:
        print("note: this pull request does not change setup.sh, so the file-scope check does not apply")

    text = SETUP.read_text()
    ok("bin/testdb" in text and "fresh" in text, "setup.sh does not build the test database (no `bin/testdb fresh`)")
    ok(".claude/athena/setup.sh" not in (ROOT / ".claude/athena/MANIFEST.json").read_text(),
       "setup.sh is listed in the harness MANIFEST, so a reinstall would overwrite it")
    ok(re.search(r"^\s*#.*never overwrites", text, re.M | re.I) is not None,
       "setup.sh's header no longer says the harness never overwrites it")
    ok(re.search(r"^\s*timeout-minutes:\s*30\s*$", (ROOT / ".github/workflows/athena.yml").read_text(), re.M) is not None,
       "the proofs job's 30-minute limit is gone from .github/workflows/athena.yml")
    longs = [m.group(0) for m in re.finditer(r"\bsleep\s+(\d+)", text) if int(m.group(1)) >= 60]
    ok(not longs, f"setup.sh adds a fixed wait of a minute or more: {longs}")
    r = run_setup("true")
    ok(r[0] == 0 and r[4] < 30, f"with every command stubbed setup.sh should finish in under 30 s. {show('job', r)}")


if __name__ == "__main__":
    cmds = {"job": job, "no-dburl": no_dburl, "off-ci": off_ci, "scope": scope}
    if len(sys.argv) != 2 or sys.argv[1] not in cmds:
        sys.exit(f"usage: {sys.argv[0]} {'|'.join(cmds)}")
    cmds[sys.argv[1]]()
    for f in FAILED:
        print("FAIL:", f)
    sys.exit(1 if FAILED else 0)
