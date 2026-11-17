"""Which of CI's jobs a change needs (`bin/ci-plan`).

Nimish, 2026-11-17: no pull request ever again runs about 3,900 tests. Every pull request, draft or ready, and every push to
main runs a small CORE (the engine's tests in tests/core.txt, the browser tests tagged `@core`); the whole suite runs once a
night on main (.github/workflows/nightly.yml calls ci.yml with suite=full). `bin/ci-plan` decides, from the changed files
alone, which core a pull request needs; `.github/workflows/ci.yml` starts only those jobs. These read both, so the rules are
held without GitHub: the script's decision for sample changed-file lists, and the workflow that obeys it.
The rule that matters most is the default: a change the script cannot place runs both cores.
"""

import importlib.machinery
import importlib.util
import pathlib
import re

import pytest
import yaml

REPO = pathlib.Path(__file__).resolve().parents[3]
_loader = importlib.machinery.SourceFileLoader("ci_plan", str(REPO / "bin" / "ci-plan"))
_spec = importlib.util.spec_from_loader("ci_plan", _loader)
assert _spec
plan = importlib.util.module_from_spec(_spec)
_loader.exec_module(plan)

CI = yaml.safe_load((REPO / ".github" / "workflows" / "ci.yml").read_text())
NIGHTLY = yaml.safe_load((REPO / ".github" / "workflows" / "nightly.yml").read_text())
# GitHub's YAML 1.1 reads the key `on` as true
TRIGGERS = CI.get("on") or CI[True]

FAST = {"engine": False, "web": False, "browser": False, "seed": False, "full": False}
CORE = FAST | {"engine": True, "web": True, "browser": True}
FULL = CORE | {"full": True}
WEB_ONLY = FAST | {"web": True, "browser": True}
ENGINE_ONLY = FAST | {"engine": True}
DOCS = [
    "docs/notes/ci-fast-paths.md",
    "HANDOFF.md",
    "docs/adr/0099-x.md",
    "docs/sources/cornerstone-blueprint-v2.html",
]
WEB = [
    "apps/web/app/page.tsx",
    "apps/web/lib/db.ts",
    "apps/web/tests/today.spec.ts",
    "apps/web/package-lock.json",
]
ENGINE = ["packages/engine/engine/assess/graph.py", "packages/engine/tests/test_x.py"]
# what reaches both the engine and the website: the schema, the gates, the map, a rules file wherever it sits
BOTH = [
    "supabase/migrations/20261105000000_x.sql",
    "packages/engine/engine/checks/rules.json",
    "rules.json",
    "workflows.json",
    "bin/check",
    ".github/workflows/ci.yml",
]
SENSITIVE = [*BOTH, *ENGINE]


def jobs(event="pull_request", draft=False, files=(), suite="core"):
    return {k: v for k, v in plan.decide(event, draft, list(files), suite).items() if k in FAST}


# --- a draft and a ready pull request are the same -------------------------------------------------------------------------


@pytest.mark.parametrize("files", [DOCS, WEB, ENGINE, BOTH, ["goals/x.yaml"]])
def test_1_a_draft_runs_the_same_core_as_a_ready_pull_request(files):
    assert jobs(draft=True, files=files) == jobs(draft=False, files=files)
    # marking a draft ready still starts a run (`ready_for_review` is not in GitHub's default list)
    assert "ready_for_review" in TRIGGERS["pull_request"]["types"]
    assert {"opened", "synchronize", "reopened"} <= set(TRIGGERS["pull_request"]["types"])


# --- the lanes ---------------------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "files",
    [
        DOCS[:1],
        DOCS,
        ["STATE.md", "docs/athena/learnings.md"],
        ["docs/frontend/wireframes/staff.html", "docs/notes/x.md"],
        ["specs/UI-6b/spec.md", "docs/notes/UI-6b.md"],
    ],
)
def test_2_a_pull_request_of_docs_alone_runs_no_core(files):
    assert jobs(files=files) == FAST


def test_2_the_docs_list_is_explicit_and_holds_nothing_a_test_reads():
    """A docs-only change runs no core, so nothing on the list may be a file a test reads."""
    assert plan.reads_of(plan.DOCS_PREFIXES + plan.DOCS_FILES) == []
    # docs/adr is read by `engine promises`, which bin/check runs on every pull request, draft or not
    assert "tests/test_promises.py" in (REPO / "bin" / "check").read_text()
    # the design scan reads docs/frontend's list of one-offs, and bin/check runs it on every pull request too (CP-68)
    assert "tests/test_design_scale.py" in (REPO / "bin" / "check").read_text()
    assert "packages/engine/tests/test_design_scale.py" in plan.READ_IN_BIN_CHECK
    # the files under a listed folder that a test reads are carved out, so a change to one runs both cores
    for read in plan.READ_BY_TESTS:
        assert jobs(files=[read]) == CORE, read
        assert any(read.startswith(p) for p in plan.DOCS_PREFIXES), (
            f"{read} is on no list; delete the carve-out"
        )
    # and these are read by tests, so they are not on it
    for read in ("BUILD-ORDER.md", "docs/design/multiplication-division-cases.json",
                 "docs/sources/assessment-workflow-v1.md", "docs/crosswalk/sources.json", "docs/spine/plan.json",
                 "docs/ux-rules.md", "docs/md-taxonomy.md"):  # fmt: skip
        assert jobs(files=[read]) == CORE, read


FRONTEND_DOCS = [
    "docs/frontend/SPEC.md",
    "docs/frontend/screens.json",
    "docs/frontend/scopes.md",
    "docs/frontend/tokens.json",
]


@pytest.mark.parametrize(
    "files",
    [
        WEB,
        WEB[:1],
        WEB + DOCS,
        FRONTEND_DOCS,
        FRONTEND_DOCS + WEB + DOCS,
        FRONTEND_DOCS + ["specs/UI-6b/spec.md", "docs/frontend/wireframes.html"],
    ],
)
def test_3_a_pull_request_of_the_website_alone_runs_the_browser_core_and_no_engine_core(files):
    assert jobs(files=files) == WEB_ONLY


def test_3_the_screens_own_documents_are_read_by_no_engine_test():
    """A change to docs/frontend (bar its wireframes, which are documents) skips the engine core, so nothing the engine's
    tests or code do may read it; the browser tests do, and their core runs."""
    assert (
        plan.reads_of([plan.WEB_DOC_PREFIX], folders=("packages/engine/tests", "packages/engine/engine"))
        == []
    )
    # the wireframes stay documents, and the folder's other files are the website's
    assert jobs(files=["docs/frontend/wireframes/staff.html"]) == FAST
    assert jobs(files=["docs/frontend/SPEC.md", "bin/check"]) == CORE
    # the engine, the schema and the seed beside the website run both cores
    for engine_or_schema in (
        "packages/engine/engine/cli.py",
        "supabase/migrations/20261105000000_x.sql",
        "supabase/seed/a.json",
    ):
        assert jobs(files=["docs/frontend/SPEC.md", engine_or_schema]) == CORE, engine_or_schema
    # a locked proof (specs/CP-*) is read by tests, and a front-end slice's spec (specs/UI-*) by none
    assert jobs(files=["specs/CP-7/proofs/cp7_world.py"]) == CORE
    assert (
        plan.reads_of(
            ["specs/UI-"], folders=("packages/engine/tests", "packages/engine/engine", "apps/web/tests")
        )
        == []
    )


@pytest.mark.parametrize("other", ["packages/engine/engine/cli.py", "supabase/migrations/1.sql", "supabase/seed/a.json",
                                   "workflows.json", "bin/check", ".github/workflows/ci.yml", "goals/a.yaml",
                                   "n8n/workflows/a.json", "package.json", "something/unknown.txt",
                                   '"quoted\\"name'])  # fmt: skip
def test_3_the_website_with_anything_else_runs_both_cores(other):
    assert jobs(files=[*WEB, other]) == CORE
    assert jobs(files=[other, *WEB, *DOCS]) == CORE


@pytest.mark.parametrize("files", [ENGINE, ENGINE[:1], [*ENGINE, *DOCS], ["packages/engine/pyproject.toml"]])
def test_4_a_pull_request_of_the_engine_alone_runs_the_engine_core_and_no_browser_core(files):
    assert jobs(files=files) == ENGINE_ONLY


@pytest.mark.parametrize("both", BOTH)
def test_5_what_the_schema_the_gates_or_the_map_are_made_of_runs_both_cores(both):
    """Even beside a docs file, the engine's code or a website file; a rules.json inside the engine is a gate, not engine code."""
    for files in ([both], [both, *DOCS], [*WEB, both], [*ENGINE, both]):
        assert jobs(files=files) == CORE, (both, files)


def test_6_main_and_a_run_by_hand_run_both_cores_whatever_changed():
    for event in ("push", "schedule", "workflow_dispatch", "something_new"):
        for files in (DOCS, WEB, ENGINE, []):
            assert jobs(event=event, files=files) == CORE, (event, files)
            assert jobs(event=event, draft=True, files=files) == CORE, (event, files)


def test_6_the_nightly_suite_runs_everything_whatever_changed():
    for event in ("pull_request", "push", "schedule", "workflow_dispatch"):
        for files in (DOCS, WEB, ENGINE, []):
            assert jobs(event=event, files=files, suite="full") == FULL, (event, files)


def cancels(event):
    """Whether ci.yml's `cancel-in-progress` cancels the older run of the same group when `event` starts a newer one: it is one
    expression, `github.event_name == '<event>'`, read here as GitHub reads it."""
    expr = CI["concurrency"]["cancel-in-progress"]
    assert expr == "${{ github.event_name == 'pull_request' }}", expr
    return event == re.search(r"github\.event_name == '(\w+)'", expr).group(1)


def test_6_a_pull_request_cancels_its_superseded_run_main_never_does_and_the_suite_runs_nightly():
    assert cancels("pull_request") is True  # a newer push to a pull request replaces its older run
    assert (
        cancels("push") is False
    )  # a merge to main is not cancelled by the next: its CI finishes, then migrate and deploy act for the newest
    group = CI["concurrency"]["group"]
    assert "github.ref" in group and "inputs.suite" in group, (
        "the nightly never takes the place of a merge's run"
    )
    assert TRIGGERS["push"]["branches"] == ["main"]
    assert "schedule" not in TRIGGERS, "the whole suite runs from nightly.yml, not from here"
    assert TRIGGERS["workflow_call"]["inputs"]["suite"]["default"] == "core"
    # nightly.yml: once a day, ci.yml with the whole suite, the acceptance proofs, and an issue when it fails
    nightly_on = NIGHTLY.get("on") or NIGHTLY[True]
    (when,) = nightly_on["schedule"]
    assert re.fullmatch(r"\d+ \d+ \* \* \*", when["cron"]), "once a day"
    nj = NIGHTLY["jobs"]
    assert nj["suite"]["uses"] == "./.github/workflows/ci.yml" and nj["suite"]["with"]["suite"] == "full"
    assert "bin/specs" in "\n".join(s.get("run", "") for s in nj["proofs"]["steps"])
    assert set(nj["report"]["needs"]) == {"suite", "proofs"} and "failure()" in nj["report"]["if"]
    assert "gh issue create" in nj["report"]["steps"][0]["run"]
    assert not (REPO / ".github" / "workflows" / "specs.yml").exists(), (
        "the proofs run nightly, not on every change"
    )
    # the plan job reads the event; nothing keys a job on the branch name, so a push to main has no way to skip its core
    assert "plan" in CI["jobs"] and "needs.plan.outputs" in str(CI["jobs"]["engine-core"]["if"])


# --- the default: what the script cannot place runs both cores -----------------------------------------------------------


@pytest.mark.parametrize(
    "files",
    [
        [],
        [""],
        ["   "],
        ["apps/web/../../supabase/migrations/1.sql"],
        ["apps/webx/a.ts"],
        ["apps/web"],
        ["/apps/web/a.ts"],
        ['"apps/web/caf\\303\\251.ts"'],
        ["apps/web/./a.ts", "docs/notes/../../bin/check"],
        ["Apps/web/a.ts"],
        ["packages/engine/../../bin/check"],
        ["docs/notes"],
        ["docs/notesx/a.md"],
        ["docs/notes/a.md", "somewhere/new.txt"],
    ],
)
def test_a_change_the_script_cannot_place_runs_both_cores(files):
    assert jobs(files=files) == CORE, files


def test_nothing_is_on_two_lists():
    for p in plan.DOCS_PREFIXES + plan.DOCS_FILES:
        assert not plan.forces_full(p), p
        assert not p.startswith(plan.WEB_PREFIX), p
    assert plan.WEB_PREFIX == "apps/web/"


def test_the_output_is_lines_the_workflow_can_append_to_github_output():
    for suite in ("core", "full"):
        out = plan.render(plan.decide("pull_request", True, DOCS, suite))
        assert {line.partition("=")[0] for line in out.splitlines()} == {*FAST, "reason"}
        for line in out.splitlines():
            key, _, value = line.partition("=")
            assert "\n" not in value
            assert key == "reason" or value in {"true", "false"}


# --- the workflow obeys the script ---------------------------------------------------------------------------------------


def _if(job):
    return str(CI["jobs"][job].get("if", ""))


def _runs(job):
    return "\n".join(s.get("run", "") for s in CI["jobs"][job]["steps"])


GATES = {  # job -> the `if` that starts it, in the plan's outputs
    "engine-shard": "needs.plan.outputs.full == 'true'",
    "browser-shard": "needs.plan.outputs.full == 'true'",
    "engine-core": "needs.plan.outputs.engine == 'true' && needs.plan.outputs.full != 'true'",
    "browser-core": "needs.plan.outputs.browser == 'true' && needs.plan.outputs.full != 'true'",
    "web": "needs.plan.outputs.web == 'true'",
    "engine-seed": "needs.plan.outputs.seed == 'true'",
}
_TERM = re.compile(r"needs\.plan\.outputs\.(\w+) (==|!=) 'true'")


def started(outputs):
    """The jobs the workflow starts for a plan's outputs, evaluating each job's own `if` as GitHub would."""
    result = {"engine-checks", "plan"}
    for job in GATES:
        terms = _if(job).split(" && ")
        assert all(_TERM.fullmatch(t) for t in terms), (job, _if(job))
        if all(bool(outputs[k]) == (op == "==") for k, op in (_TERM.fullmatch(t).groups() for t in terms)):
            result.add(job)
    return result


def test_each_job_starts_on_exactly_its_own_output():
    for job, expr in GATES.items():
        assert _if(job) == expr, job
        assert "plan" in CI["jobs"][job]["needs"], job
    assert "needs" not in CI["jobs"]["engine-checks"], "the fast checks wait for nothing and never skip"
    assert "if" not in CI["jobs"]["engine-checks"]
    assert "engine-web-reads" not in CI["jobs"]


def test_each_core_runs_its_own_tagged_tests_on_one_runner():
    assert "pytest -q -p no:cacheprovider -m core" in _runs("engine-core")
    assert "playwright test --grep @core" in _runs("browser-core")
    for job in ("engine-core", "browser-core"):
        assert "strategy" not in CI["jobs"][job], f"{job} runs on one runner"


@pytest.mark.parametrize("draft", [False, True])
@pytest.mark.parametrize(
    ("files", "suite", "expected"),
    [
        (DOCS, "core", set()),
        (WEB, "core", {"web", "browser-core"}),
        (ENGINE, "core", {"engine-core"}),
        (["bin/check"], "core", {"web", "engine-core", "browser-core"}),
        (["packages/engine/engine/cli.py", *DOCS], "core", {"engine-core"}),
        (["packages/engine/engine/cli.py", *WEB], "core", {"web", "engine-core", "browser-core"}),
        (DOCS, "full", {"web", "engine-shard", "browser-shard"}),
    ],
)
def test_the_workflow_starts_only_the_jobs_the_plan_names(files, suite, expected, draft):
    assert started(plan.decide("pull_request", draft, files, suite)) == {"engine-checks", "plan"} | expected


def test_a_skipped_job_still_reports_the_names_the_gates_wait_on():
    """`engine` and `browser` run whatever the plan said, and say success when their jobs were skipped on purpose; a plan
    that failed is a failure (the jobs would be skipped for that too, which must not read as a pass)."""
    for name, shards, core in (
        ("engine", "engine-shard", "engine-core"),
        ("browser", "browser-shard", "browser-core"),
    ):
        job = CI["jobs"][name]
        assert job["if"] == "always()", name
        assert {"plan", shards, core} <= set(job["needs"])
        last = job["steps"][-1]
        assert last["if"] == "always()" and "needs.plan.result" in last["run"], name
        assert "success" in last["run"]
        # the core must pass when the plan named it, and the shards when the plan ran the whole suite
        assert f'needs.{core}.result }}}}" = success' in last["run"], name
        assert f'needs.{shards}.result }}}}" = success' in last["run"], name
        # with the checkout skipped there is no packages/engine folder, so a step that runs there cannot even start (#412, 2026-11-05)
        assert "working-directory" in last or "defaults" not in job, name
    assert {"engine-checks"} <= set(CI["jobs"]["engine"]["needs"])
    for job in ("engine-checks", "engine", "web", "browser"):
        assert job in CI["jobs"], f"the required check '{job}' must keep its name"
    assert CI["name"] == "ci"
    assert CI["jobs"]["engine-shard"]["name"] == "engine shard ${{ matrix.shard }}"
    assert CI["jobs"]["browser-shard"]["name"] == "browser shard ${{ matrix.shard }}"


def test_the_plan_job_falls_back_to_both_cores_when_it_cannot_decide():
    steps = CI["jobs"]["plan"]["steps"]
    assert steps[0]["uses"].startswith("actions/checkout") and steps[0]["with"]["fetch-depth"] == 0
    run = _runs("plan")
    assert "bin/ci-plan" in run and "--no-renames" in run, (
        "a file moved out of bin/ must show as a change to bin/"
    )
    assert "|| " in run and "engine=true" in run and "web=true" in run and "browser=true" in run, run
    assert "seed=false" in run and "full=" in run and '--suite "$SUITE"' in run
    assert (
        "inputs.suite" in str(steps)
        and "pull_request.draft" in str(steps)
        and "github.event_name" in str(steps)
    )
    assert set(CI["jobs"]["plan"]["outputs"]) == {*FAST, "reason"}
    assert all(
        CI["jobs"]["plan"]["outputs"][k] == f"${{{{ steps.plan.outputs.{k} }}}}"
        for k in CI["jobs"]["plan"]["outputs"]
    )


def test_the_draft_runs_the_layout_map_and_the_other_checks_that_need_no_database():
    assert "../../bin/check" in _runs("engine-checks")
