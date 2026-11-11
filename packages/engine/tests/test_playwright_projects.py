"""Every browser spec is run by exactly one Playwright project (apps/web/playwright.config.ts).

A project runs the specs whose path matches its `testMatch`; a spec that matches none is never listed, so CI's "every browser test
ran, and ran once" cannot see it is missing, and it cannot fail. On 2026-11-11 `tests/ui-3a-notes-loop.spec.ts` had never run: the
`steps` pattern needs a letter and a number before the dash (`u74-...`), and "ui-3a-" has no number after the u. Seven of its fourteen
tests failed the first time it was run. No database or browser is used here: the config and the file names are read."""

import re
from pathlib import Path

WEB = Path(__file__).resolve().parents[3] / "apps" / "web"
CONFIG = (WEB / "playwright.config.ts").read_text(encoding="utf-8")

# Debt frozen on 2026-11-11 (baseline and ratchet, CLAUDE.md): a spec that matches no project today. A name may leave this list, never join it;
# once a spec is renamed to a pattern a project runs, the test below makes its name come off (the list may only shrink).
NOT_RUN_YET = {"tests/ui-3a-notes-loop.spec.ts"}


def projects():
    """Each project as (name, test directory, regex): the entries of the config's `projects` array that name a `testMatch`."""
    found = []
    for m in re.finditer(
        r"\{\s*name:\s*\"(\w+)\"\s*,(?:\s*testDir:\s*\"\./(\w+)\"\s*,)?\s*testMatch:\s*/(.+?)/[,\s]", CONFIG
    ):
        found.append((m.group(1), m.group(2) or "tests", re.compile(m.group(3))))
    return found


def specs():
    out = []
    for folder in {d for _, d, _ in projects()}:
        out += [
            p.relative_to(WEB).as_posix()
            for p in (WEB / folder).rglob("*.spec.ts")
            if "node_modules" not in p.parts
        ]
    return sorted(out)


def runners(spec):
    """The projects that run `spec`: the file is under the project's directory and its path matches the project's `testMatch`."""
    return [n for n, d, rx in projects() if spec.startswith(f"{d}/") and rx.search(spec)]


def test_the_config_is_read_whole():
    names = {n for n, _, _ in projects()}
    assert {"screens", "e2e", "gate", "password", "steps", "journey", "map"} <= names, names
    assert len(specs()) > 100, "the specs were not found"


def test_every_spec_is_run_by_a_project():
    unrun = {s for s in specs() if not runners(s)}
    assert unrun <= NOT_RUN_YET, (
        f"{sorted(unrun - NOT_RUN_YET)} match no Playwright project, so CI never runs them. Rename the file to a pattern a project "
        "runs (a `steps` spec is [sumpe]<number>-<name>.spec.ts, like u74-setup-content.spec.ts), or add a project."
    )


def test_no_spec_is_run_twice():
    twice = {s: runners(s) for s in specs() if len(runners(s)) > 1}
    assert twice == {}, f"each spec belongs to one project: {twice}"


def test_a_spec_that_now_runs_comes_off_the_frozen_list():
    now_run = sorted(s for s in NOT_RUN_YET if (WEB / s).exists() and runners(s))
    gone = sorted(s for s in NOT_RUN_YET if not (WEB / s).exists())
    assert now_run == [] and gone == [], f"take {now_run + gone} off NOT_RUN_YET: it is run now (or gone)"
