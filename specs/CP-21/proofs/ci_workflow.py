#!/usr/bin/env python3
"""CP-21 proofs on .github/workflows/ci.yml and apps/web/playwright.config.ts. Fake data only, no database, no browser.

  ci_workflow.py shard-limits   # 1: browser shards have timeout-minutes; in CI a shard stops after a set number of failures
  ci_workflow.py rollup         # 2: `browser` and `engine` roll-ups print "cancelled" for a cancelled shard, "failed" for a failed one

1 runs Playwright for real, with the repository's own config (and any --max-failures/-x flag ci.yml's browser-shard command
  passes), on a scratch spec of deliberately failing tests that need no browser: with CI set the run must stop early; without
  CI every test must run. Needs apps/web/node_modules (npm ci; setup.sh runs it).
2 takes the roll-up step(s) that read the shard job's result out of ci.yml, fills in each `${{ ... }}` with fake values and runs
  them with bash, for a shard result of cancelled, failure and success.
"""

import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps/web"
CI = yaml.safe_load((ROOT / ".github/workflows/ci.yml").read_text())
JOBS = CI["jobs"]
FAILED = []
N_TESTS = 25


def ok(cond, msg):
    if not cond:
        FAILED.append(msg)
    return cond


def done():
    for m in FAILED:
        print("FAIL:", m)
    sys.exit(1 if FAILED else 0)


# ---------- 1 ----------

def playwright_flags_from_ci():
    """The --max-failures / -x flags the browser shard's `playwright test` command passes, if any."""
    runs = [s.get("run", "") for s in JOBS["browser-shard"]["steps"]]
    cmds = [r for r in runs if re.search(r"playwright test\b", r) and "install" not in r]
    ok(len(cmds) == 1, f"browser-shard should run `playwright test` in exactly one step, found {len(cmds)}")
    if not cmds:
        return []
    toks = shlex.split(re.sub(r"\$\{\{.*?\}\}", "X", cmds[0].split("playwright test", 1)[1]))
    flags = []
    for i, t in enumerate(toks):
        if t == "-x" or t.startswith("--max-failures="):
            flags.append(t)
        elif t == "--max-failures" and i + 1 < len(toks):
            flags += [t, toks[i + 1]]
    return flags


def run_failing_suite(ci, flags):
    """Run N_TESTS failing tests under the repo's playwright config. Returns (exit code, stats dict, output)."""
    with tempfile.TemporaryDirectory(prefix="cp21-") as tmp:
        tmp = Path(tmp)
        # the wrapper imports @playwright/test from here; the symlink resolves to the same package the real config uses
        (tmp / "node_modules").symlink_to(WEB / "node_modules")
        (tmp / "specs").mkdir()
        body = "".join(f'test("deliberately fails {i}", () => {{ expect(1).toBe(2); }});\n' for i in range(N_TESTS))
        (tmp / "specs/deliberately-failing.spec.ts").write_text('import { test, expect } from "@playwright/test";\n' + body)
        (tmp / "wrapper.config.ts").write_text(
            'import { defineConfig } from "@playwright/test";\n'
            f'import base from {json.dumps(str(WEB / "playwright.config"))};\n'
            "// the repo's own config, minus its servers, its sign-in and its projects: these tests open no page\n"
            "export default defineConfig({ ...base, testDir: \"./specs\", projects: [{ name: \"cp21\" }],\n"
            "  webServer: undefined, globalSetup: undefined, reporter: [[\"json\"]] });\n")
        report = tmp / "report.json"
        env = {k: v for k, v in os.environ.items() if k not in ("CI", "GITHUB_ACTIONS")}
        env.update(TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres",
                   PLAYWRIGHT_JSON_OUTPUT_NAME=str(report))
        env.pop("TEST_WEB_DATABASE_URL", None)
        env.pop("TEST_ENGINE_DATABASE_URL", None)
        if ci:
            env["CI"] = "true"
        p = subprocess.run(["npx", "--no-install", "playwright", "test", "-c", str(tmp / "wrapper.config.ts"), *flags],
                           cwd=WEB, env=env, capture_output=True, text=True, timeout=180)
        out = p.stdout + p.stderr
        stats = json.loads(report.read_text())["stats"] if report.exists() else {}
        return p.returncode, stats, out


def shard_limits():
    shard = JOBS["browser-shard"]
    t = shard.get("timeout-minutes")
    ok(isinstance(t, (int, float)) and t > 0, f"browser-shard has no positive timeout-minutes (found {t!r})")

    if not ok((WEB / "node_modules/@playwright/test").exists(), "apps/web/node_modules missing: run npm ci in apps/web"):
        return
    flags = playwright_flags_from_ci()
    print("flags from ci.yml's browser-shard command:", flags or "(none)")

    rc, stats, out = run_failing_suite(ci=True, flags=flags)
    print("CI run:", stats)
    ran = stats.get("unexpected", 0) + stats.get("flaky", 0) + stats.get("expected", 0)
    if ok(stats, f"the CI run produced no JSON report:\n{out[-1500:]}"):
        ok(rc != 0, "the CI run of failing tests exited 0")
        ok(0 < ran < N_TESTS,
           f"with CI set, Playwright ran {ran} of {N_TESTS} failing tests: it did not stop the shard early "
           "(no maxFailures in CI, no --max-failures/-x on the shard's command)")

    rc, stats, out = run_failing_suite(ci=False, flags=[])
    print("local run:", stats)
    if ok(stats, f"the local run produced no JSON report:\n{out[-1500:]}"):
        ok(stats.get("unexpected", 0) == N_TESTS,
           f"without CI, all {N_TESTS} failing tests should run (maxFailures only in CI); got {stats}")


# ---------- 2 ----------

def rollup_steps(job, shard_job):
    steps = [s for s in JOBS[job]["steps"]
             if "run" in s and f"needs.{shard_job}.result" in (s["run"] + json.dumps(s.get("env", {})))]
    ok(steps, f"no step of `{job}` reads needs.{shard_job}.result")
    return steps


def fill(text, values):
    def sub(m):
        key = m.group(1).strip()
        if key not in values:
            FAILED.append(f"unexpected expression ${{{{ {key} }}}} in the roll-up step; the proof knows {sorted(values)}")
            return ""
        return values[key]
    return re.sub(r"\$\{\{(.*?)\}\}", sub, text)


def run_rollup(job, shard_job, shard_result):
    values = {
        "needs.plan.result": "success",
        "needs.plan.outputs.reason": "cp21 fake plan",
        "needs.plan.outputs.engine": "true",
        "needs.plan.outputs.browser": "true",
        "needs.plan.outputs.web": "true",
        "needs.plan.outputs.web_reads": "false",
        "needs.engine-checks.result": "success",
        f"needs.{shard_job}.result": shard_result,
        "env.SHARDS": str(JOBS[job].get("env", {}).get("SHARDS", "3")),
    }
    out, rc = "", 0
    for step in rollup_steps(job, shard_job):
        env = dict(os.environ)
        env.update({k: fill(str(v), values) for k, v in step.get("env", {}).items()})
        env.update({k: str(v) for k, v in JOBS[job].get("env", {}).items()})
        p = subprocess.run(["bash", "-e", "-c", fill(step["run"], values)], env=env, capture_output=True, text=True,
                           cwd=tempfile.gettempdir(), timeout=60)
        out += p.stdout + p.stderr
        rc = rc or p.returncode
    return rc, out


def rollup():
    for job, shard_job in (("browser", "browser-shard"), ("engine", "engine-shard")):
        rc, out = run_rollup(job, shard_job, "cancelled")
        print(f"--- {job}, shards cancelled (exit {rc}):\n{out}")
        ok(re.search(r"\bcancell?ed\b", out, re.I), f"`{job}` does not say cancelled when its shards were cancelled")
        ok(not re.search(r"\bfail(ed|ure)?\b", out, re.I), f"`{job}` says failed/failure when its shards were cancelled")

        rc, out = run_rollup(job, shard_job, "failure")
        print(f"--- {job}, a shard failed (exit {rc}):\n{out}")
        ok(re.search(r"\bfailed\b", out, re.I), f"`{job}` does not print \"failed\" when a shard failed")
        ok(not re.search(r"\bcancell?ed\b", out, re.I), f"`{job}` says cancelled when a shard failed")
        ok(rc != 0, f"`{job}` exits 0 when a shard failed")

        rc, out = run_rollup(job, shard_job, "success")
        print(f"--- {job}, shards passed (exit {rc}):\n{out}")
        ok(rc == 0, f"`{job}` fails when every shard passed")
        ok(not re.search(r"\b(failed|cancell?ed)\b", out, re.I), f"`{job}` says failed or cancelled when every shard passed")


if __name__ == "__main__":
    {"shard-limits": shard_limits, "rollup": rollup}[sys.argv[1]]()
    done()
