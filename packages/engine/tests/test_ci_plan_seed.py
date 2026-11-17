"""The data lane of `bin/ci-plan` (seed data and two notes alone): which changes take it, what it runs, and that the workflow obeys.
Nimish, 2026-11-17: no 25-minute full run for a data change. The rest of the plan's rules are in test_ci_plan.py; main runs both cores."""

import pytest
from test_ci_plan import CI, CORE, DOCS, FAST, REPO, SENSITIVE, WEB, _if, _runs, jobs, plan, started

SEED_ONLY = FAST | {"seed": True}
SEED = [
    "supabase/seed/levels.json",
    "supabase/seed/curriculum/k2/objectives.json",
    "supabase/seed/skills/placement/SKILL.md",
    "supabase/seed/config.json",
    "DECISIONS-LOG.md",
    "CLAUDE.md",
]


@pytest.mark.parametrize("files", [SEED, SEED[:1], SEED[4:], [*SEED, *DOCS], [*DOCS, "supabase/seed/a.json"]])
def test_6_a_pull_request_of_seed_data_and_notes_alone_runs_the_data_lane(files):
    assert jobs(files=files) == SEED_ONLY, files
    assert not jobs(files=files)["engine"], "no core, no shard, no browser"


@pytest.mark.parametrize(
    "other", [*SENSITIVE, *WEB, "goals/a.yaml", "docs/ux-rules.md", "something/unknown.txt", '"quoted\\"name']
)
def test_6_anything_else_beside_seed_data_leaves_the_lane_and_a_draft_and_main_keep_their_own_lanes(other):
    for files in ([other, *SEED], [*SEED, other, *DOCS]):
        got = jobs(files=files)
        assert got["seed"] is False and got["engine"] is True, (other, got)
    assert jobs(draft=True, files=SEED) == SEED_ONLY  # a draft takes the same lane as a ready pull request
    assert jobs(event="push", files=SEED) == CORE  # the merge runs both cores; the whole suite runs nightly


def test_6_the_data_lane_runs_tests_that_exist_and_one_job_holds_the_roll_up_to_them():
    for t in plan.SEED_TESTS:
        assert (REPO / "packages" / "engine" / t).is_file(), t
    assert {
        "tests/test_loaders.py",
        "tests/test_apply_seed.py",
        "tests/test_layout.py",
        "tests/test_rules.py",
    } <= set(plan.SEED_TESTS)
    assert plan.SEED_PREFIXES == ("supabase/seed/",)
    # the notes in the lane are the ones the lane's tests read (a note no lane test reads is not on it)
    assert plan.reads_of(["DECISIONS-LOG.md"]) and all(
        "tests/" + n.split("tests/")[1].split(":")[0] in plan.SEED_TESTS
        for n in plan.reads_of(["DECISIONS-LOG.md"])
    )
    job = CI["jobs"]["engine-seed"]
    assert job["needs"] == ["plan"] and _if("engine-seed") == "needs.plan.outputs.seed == 'true'"
    run = _runs("engine-seed")
    assert "bin/testdb schema" in run and "bin/ci-plan seed-tests" in run
    assert "engine-seed" in CI["jobs"]["engine"]["needs"] and "needs.engine-seed.result" in _runs("engine")


def test_the_workflow_starts_the_data_lane_for_seed_data_and_no_shard():
    assert started(plan.decide("pull_request", False, SEED)) == {"engine-checks", "plan", "engine-seed"}
    assert started(plan.decide("pull_request", True, SEED)) == {"engine-checks", "plan", "engine-seed"}
