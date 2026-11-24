"""loop-guard's builder rules see the builder's own commits, never what a merge of main brought in.

PR #929 (ticket #925) failed loop-guard with "Ticket PRs must not edit HANDOFF.md", "docs/adr/0109…: protected file
changed on a build branch" and an over-budget count, all from plan PRs #927/#928 that `loop prep` merged into the build
branch after Plan-base. These build a tiny repository with that history and run .github/loop/check_pr.py on it.
"""

import os
import pathlib
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parents[3]
GUARD = REPO / ".github" / "loop" / "check_pr.py"


def git(repo, *args):
    return subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True).stdout.strip()


def commit(repo, files, message):
    for name, text in files.items():
        path = repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", message)
    return git(repo, "rev-parse", "HEAD")


def build_branch(tmp_path, builder_files):
    """main: seed. Build branch: Plan-base (the seed), the builder's commit, then main's later plan PR merged in."""
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.email", "t@example.com")
    git(repo, "config", "user.name", "t")
    commit(
        repo,
        {"HANDOFF.md": "start\n", "docs/adr/0001-a.md": "a\n", "engine/k1.py": "x = 1\n\n\n\nz = 0\n"},
        "seed",
    )
    plan_base = git(repo, "rev-parse", "HEAD")
    git(repo, "checkout", "-q", "-b", "t925-build")
    commit(
        repo,
        {"engine/k1.py": "x = 2\n\n\n\nz = 0\n", "docs/loop/handoff/925.md": "done\n", **builder_files},
        "builder",
    )
    git(repo, "checkout", "-q", "main")
    # a later plan PR on main: HANDOFF.md, a protected ADR and 60 lines the builder never wrote
    adr = "".join(f"line {i}\n" for i in range(60))
    commit(
        repo,
        {
            "HANDOFF.md": "plan pr\n",
            "docs/adr/0109-k1.md": adr,
            "engine/k1.py": "x = 1\n\n\n\nz = 0\ny = 3\n",
        },
        "plan PR",
    )
    git(repo, "checkout", "-q", "t925-build")
    git(repo, "merge", "-q", "--no-edit", "-X", "ours", "main")
    return repo, plan_base


def guard(repo, plan_base):
    body = f"Closes #925\nBudget: files<=2 lines<=10\nPlan-base: {plan_base}\n"
    env = {**os.environ, "PR_BODY": body}
    return subprocess.run(
        [sys.executable, str(GUARD), "main", "t925-build"], cwd=repo, env=env, capture_output=True, text=True
    )


def test_what_a_merge_of_main_brought_in_is_not_the_builders(tmp_path):
    repo, plan_base = build_branch(tmp_path, {})
    out = guard(repo, plan_base)
    assert out.returncode == 0, out.stdout + out.stderr


def test_a_builder_commit_that_edits_handoff_still_fails(tmp_path):
    repo, plan_base = build_branch(tmp_path, {"HANDOFF.md": "builder wrote this\n"})
    out = guard(repo, plan_base)
    assert out.returncode == 1
    assert "Ticket PRs must not edit HANDOFF.md" in out.stdout
    assert "docs/adr/0109" not in out.stdout
