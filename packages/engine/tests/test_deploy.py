"""What reaches live, and when (goals/p0-live-changes-wait-for-ci.yaml, goals/p0-papers-survive-a-deploy.yaml,
goals/l4-the-website-waits-for-the-database.yaml, goals/l14-migrations-wait-for-locks.yaml).

Both read the files that deploy, not a live run: the code review of 2026-09-30 found the engine rebuilt and the live
database migrated on every push to main while CI was still running, and every paper the engine had rendered gone
with the container each deploy recreated.
"""

import re
from pathlib import Path

import yaml

from engine.core import db

WORKFLOWS = db.REPO_ROOT / ".github" / "workflows"
LIVE = ("deploy-engine.yml", "migrate.yml")
GATED = "steps.plan.outputs.go == 'yes'"


def _load(path: Path) -> dict:
    return yaml.safe_load(path.read_text())


def _on(spec: dict) -> dict:
    return spec.get("on", spec.get(True))  # YAML 1.1 reads the bare key `on` as true


def test_the_workflow_waited_for_is_ci():
    assert _load(WORKFLOWS / "ci.yml")["name"] == "ci"


def test_nothing_reaches_live_before_ci_passes_on_that_commit():
    for name in LIVE:
        spec = _load(WORKFLOWS / name)
        on = _on(spec)
        assert "push" not in on, f"{name} starts on a push, beside CI"
        assert on["workflow_run"] == {"workflows": ["ci"], "types": ["completed"], "branches": ["main"]}, name
        (job,) = spec["jobs"].values()
        assert "github.event.workflow_run.conclusion == 'success'" in job["if"], f"{name} runs on a red CI"
        assert "workflow_run.head_sha" in job["env"]["SHA"], f"{name} does not take the commit CI passed on"
        checkout = next(s for s in job["steps"] if s.get("uses", "").startswith("actions/checkout"))
        assert checkout["with"]["ref"] == "${{ env.SHA }}", f"{name} checks out main's newest instead"


def test_only_mains_newest_commit_changes_live():
    for name in LIVE:
        (job,) = _load(WORKFLOWS / name)["jobs"].values()
        steps = job["steps"]
        at = next(i for i, s in enumerate(steps) if s.get("id") == "plan")
        assert "git ls-remote origin refs/heads/main" in steps[at]["run"], (
            f"{name} never asks what main holds"
        )
        after = [s.get("name") or s.get("uses") for s in steps[at + 1 :] if GATED not in s.get("if", "")]
        # migrate live's last step may also run for a commit live already has every migration of (CP-73); it pushes nothing
        after = [
            n
            for n in after
            if not (
                name == "migrate.yml" and "release == 'yes'" in steps[-1]["if"] and n == steps[-1]["name"]
            )
        ]
        assert after == [], f"{name} runs {after} even when a newer merge is on main"


def test_a_newer_merge_cancels_mains_older_ci_run():  # the name goals/ci1-main-runs-only-its-newest.yaml cites; what it proves changed, below
    """Not any more (11 Nov 2026): a newer merge no longer cancels main's older run, a newer push to a pull request still does.
    Seven merges in a row queued seven runs of the full suite on main and held the website for over an hour (2026-10-22); cancelling
    main's older runs instead left about twelve merges whose CI never finished, so none was deployed (11 Nov 2026). Now a pull request's
    newer push cancels its older run and a merge to main waits its turn (GitHub keeps one run waiting): an older merge's CI may finish
    last, and migrate live and deploy engine act only for main's newest commit (above), so it changes nothing."""
    group = _load(WORKFLOWS / "ci.yml")["concurrency"]
    cancel = group["cancel-in-progress"]
    assert cancel == "${{ github.event_name == 'pull_request' }}", "only a pull request's runs are cancelled"
    event = re.search(r"github\.event_name == '(\w+)'", cancel).group(1)
    assert event == "pull_request" and event != "push", "a merge to main (a push) is never cancelled"
    assert "github.ref" in group["group"], "main's runs must share one group, so they wait their turn"
    assert "github.sha" not in group["group"], "a group per commit never cancels anything"
    # and the two workflows that act on main's merges are never cancelled mid-way
    for name in ("migrate.yml", "deploy-engine.yml"):
        assert _load(WORKFLOWS / name)["concurrency"]["cancel-in-progress"] is False, name


def test_the_website_goes_live_only_once_live_has_the_commits_migrations():
    """Vercel holds each production deployment until the commit's `live database` status is green (Deployment Checks,
    ADR 0074); only migrate live sets it, on the commit it migrated, after `db push` — so a page never reaches a
    database that lacks its tables (2026-10-15: the site down 03:00–03:26 UTC while migrate live waited on CI)."""
    spec = _load(WORKFLOWS / "migrate.yml")
    (job,) = spec["jobs"].values()
    assert job["permissions"]["statuses"] == "write", "migrate live cannot set a commit's status"
    *_, push, said = job["steps"]
    assert push["run"] == "bin/push-migrations", "the status is not set after the migration"
    assert said["if"] == f"!cancelled() && ({GATED} || steps.plan.outputs.release == 'yes')", (
        "the status is set only for main's newest commit, or one live already has every migration of (CP-73)"
    )
    assert said["env"]["STATE"] == "${{ job.status == 'success' && 'success' || 'failure' }}"
    for needed in ("statuses/$SHA", 'context="live database"', 'state="$STATE"'):
        assert needed in said["run"], needed
    assert "live database" in (WORKFLOWS / "ci.yml").read_text(), (
        "ci.yml still says Vercel deploys on every merge"
    )


def test_the_engines_data_folder_is_on_the_servers_disk():
    # where the image's engine writes: REPO_ROOT is the folder holding `engine/`, so its data folder is /app/data
    dockerfile = (db.REPO_ROOT / "packages" / "engine" / "Dockerfile").read_text()
    runtime = dockerfile.split(" AS runtime", 1)[1]
    assert re.search(r"^WORKDIR /app$", runtime, re.M)
    assert re.search(r"^COPY engine \./engine$", runtime, re.M)
    inside = db._repo_root_for(Path("/app/engine/core/db.py")) / "data"
    assert inside == Path("/app/data")

    volumes = _load(db.REPO_ROOT / "deploy" / "compose.server.yml")["services"]["engine"]["volumes"]
    on_disk = [v for v in volumes if v.split(":")[1] == str(inside)]
    assert on_disk, "the engine's data folder lives in the container and goes with every rebuild"
    host, _, mode = on_disk[0].partition(":")
    assert host.startswith("${HOME}/") and not mode.endswith(":ro"), on_disk[0]


def test_live_is_watched_every_ten_minutes_from_outside_the_server():
    """watch-live.yml asks the engine what is wrong on the server, checks both public doors, and tells Nimish by an
    issue that mentions him; the server's address is masked, because the repository's logs are public
    (goals/p2-live-is-watched.yaml)."""
    spec = _load(WORKFLOWS / "watch-live.yml")
    assert _on(spec)["schedule"] == [{"cron": "*/10 * * * *"}]
    script = "\n".join(s.get("run", "") for s in spec["jobs"]["watch"]["steps"])
    for needed in (
        "engine live watch",
        "::add-mask::",
        "/health",
        "/login",
        "@nimishshah1989",
        "gh issue close",
    ):
        assert needed in script, needed
    assert spec["permissions"]["issues"] == "write"


def test_a_bad_deploy_is_undone_by_naming_an_earlier_commit():
    """Run by hand, the deploy takes the commit to roll back to and deploys exactly that (goals/p2-live-recovers.yaml)."""
    spec = _load(WORKFLOWS / "deploy-engine.yml")
    assert "commit" in _on(spec)["workflow_dispatch"]["inputs"]
    sha = spec["jobs"]["deploy"]["env"]["SHA"]
    assert "inputs.commit" in sha and sha.index("inputs.commit") < sha.index("github.sha")
    assert spec["jobs"]["deploy"]["steps"][0]["with"]["ref"] == "${{ env.SHA }}"


# goals/l8-deploy-without-downtime.yaml. Every deploy to 21 Oct 2026 stopped the engine, then started the new one: 23–31
# seconds of "The engine refused (502)" (measured on the deploy engine runs' own logs, docs/notes/l8-…md).
SWITCH = db.REPO_ROOT / "deploy" / "switch.sh"
FAKES = {
    # every call written down; `docker exec deploy-caddy-1 cat …` answers with the Caddyfile the folder holds
    "docker": 'echo "docker $*" >> "$LOG"\n'
    'if [ "$1 $2" = "exec deploy-caddy-1" ]; then cat "$CADDY_SEES"; fi\n',
    # /health answers 200, except on a port named in DOWN
    "curl": 'url="${@: -1}"; port="${url#http://127.0.0.1:}"; port="${port%%/*}"\n'
    'case " $DOWN " in *" $port "*) echo "curl $port 000" >> "$LOG"; printf 000 ;;'
    ' *) echo "curl $port 200" >> "$LOG"; printf 200 ;; esac\n',
    "sleep": "",
}


def _switch(tmp_path, down="", caddy_sees=None):
    """deploy/switch.sh run as the server runs it, with docker, curl and sleep that only write down what they were asked
    → (exit code, every call in order)."""
    import os
    import subprocess

    bin_ = tmp_path / "bin"
    bin_.mkdir()
    for name, body in FAKES.items():
        (bin_ / name).write_text("#!/usr/bin/env bash\n" + body)
        (bin_ / name).chmod(0o755)
    log = tmp_path / "calls"
    log.touch()
    seen = tmp_path / "caddy-sees"
    seen.write_text(caddy_sees if caddy_sees is not None else (SWITCH.parent / "Caddyfile").read_text())
    env = {**os.environ, "PATH": f"{bin_}:{os.environ['PATH']}", "LOG": str(log), "DOWN": down, "TRIES": "3"}
    env["CADDY_SEES"] = str(seen)
    done = subprocess.run(["bash", str(SWITCH)], cwd=SWITCH.parent, env=env, capture_output=True, text=True)
    return done.returncode, log.read_text().splitlines()


def _at(calls, start):
    return next(i for i, c in enumerate(calls) if c.startswith(start))


def test_the_new_engine_answers_beside_the_old_before_the_old_is_replaced(tmp_path):
    code, calls = _switch(tmp_path)
    assert code == 0, calls
    built = _at(calls, "docker compose -f compose.server.yml build engine")
    standby = _at(calls, "docker compose -f compose.server.yml run -d --no-deps --name deploy-engine-standby")
    answered = _at(calls, "curl 8001 200")
    replaced = _at(
        calls, "docker compose -f compose.server.yml up -d --no-deps --no-build --force-recreate engine"
    )
    back = _at(calls, "curl 8000 200")
    gone = _at(calls, "docker stop --time 900 deploy-engine-standby")
    assert built < standby < answered < replaced < back < gone, calls
    assert "-p 127.0.0.1:8001:8000 -e ENGINE_STANDBY=1 engine" in calls[standby]
    assert not any("force-recreate caddy" in c for c in calls), "Caddy restarted with a file it already reads"


def test_a_new_engine_that_never_answers_leaves_the_old_one_serving(tmp_path):
    code, calls = _switch(tmp_path, down="8001")
    assert code == 1
    assert not any(" up " in c and c.endswith(" engine") for c in calls), "the old engine was replaced anyway"
    assert calls[-1] == "docker rm -f deploy-engine-standby", calls


def test_a_new_engine_on_8000_that_never_answers_leaves_the_standby_serving(tmp_path):
    code, calls = _switch(tmp_path, down="8000")
    assert code == 1
    assert not any("deploy-engine-standby" in c for c in calls[_at(calls, "curl 8001 200") :]), calls


def test_a_changed_caddyfile_is_read_by_a_new_caddy_before_anything_moves(tmp_path):
    code, calls = _switch(tmp_path, caddy_sees="{$ENGINE_HOST} {\n\treverse_proxy 127.0.0.1:8000\n}\n")
    assert code == 0, calls
    assert _at(calls, "docker compose -f compose.server.yml up -d --no-deps --force-recreate caddy") < _at(
        calls, "docker compose -f compose.server.yml run"
    )


def test_the_door_sends_each_request_to_whichever_engine_answers():
    """Caddy holds both places the engine can answer and asks each for /health; a request goes to the first that
    answered, and one that finds neither waits for one instead of failing at once. `caddy adapt --validate` on the
    caddy:2 image passed on this file (docs/notes/l8-deploy-without-downtime.md)."""
    caddy = (SWITCH.parent / "Caddyfile").read_text()
    proxy = re.search(r"reverse_proxy ([^{]+)\{(.*?)\}", caddy, re.S)
    assert proxy[1].split() == ["127.0.0.1:8000", "127.0.0.1:8001"]
    said = dict(line.split(None, 1) for line in proxy[2].strip().splitlines())
    assert said["lb_policy"] == "first" and said["health_uri"] == "/health"
    assert said["lb_try_duration"] == "30s", "a request finding no engine fails at once"
    ports = _load(SWITCH.parent / "compose.server.yml")["services"]["engine"]["ports"]
    assert ports == ["127.0.0.1:8000:8000"]


def test_a_deploy_switches_engines_instead_of_restarting_the_one():
    (job,) = _load(WORKFLOWS / "deploy-engine.yml")["jobs"].values()
    start = next(s for s in job["steps"] if s.get("name") == "start the engine")["run"]
    assert "bash switch.sh" in start and "up -d --build" not in start


def test_a_code_change_keeps_the_browser_and_the_readers_models():
    """Each deploy fetched Chromium (57 s) and the reader's models (37 s) again and wrote them out (52 s), because the
    whole engine was copied in above them. Only the reader's own file is now, and it reads nothing else of the engine."""
    runtime = (db.REPO_ROOT / "packages" / "engine" / "Dockerfile").read_text().split(" AS runtime", 1)[1]
    lines = [ln for ln in runtime.splitlines() if ln and not ln.startswith("#")]
    at = {
        key: next(i for i, ln in enumerate(lines) if key in ln)
        for key in ("playwright install", "digits._load()")
    }
    code = lines.index("COPY engine ./engine")
    assert at["playwright install"] < code and at["digits._load()"] < code, lines
    copied = [ln for ln in lines[: at["digits._load()"]] if ln.startswith("COPY engine")]
    assert copied == [
        "COPY engine/__init__.py engine/",
        "COPY engine/adapters/__init__.py engine/adapters/digits.py engine/adapters/",
    ]
    reader = (db.REPO_ROOT / "packages" / "engine" / "engine" / "adapters" / "digits.py").read_text()
    assert not re.search(r"^\s*(from|import) engine", reader, re.M), (
        "the reader needs more of the engine than is copied"
    )


def test_a_standby_leaves_the_serving_engines_runs_alone(monkeypatch):
    from fastapi.testclient import TestClient

    from engine.api import app as engine_app

    marked = []
    monkeypatch.setattr(engine_app.runs, "orphaned", lambda: marked.append(1))
    monkeypatch.setenv("ENGINE_STANDBY", "1")
    with TestClient(engine_app.app):
        pass
    assert marked == [], "the standby marked the serving engine's runs as dead"
    monkeypatch.delenv("ENGINE_STANDBY")
    with TestClient(engine_app.app):
        pass
    assert marked == [1], "an engine starting after one stopped no longer marks the runs that died with it"


PUSH = db.REPO_ROOT / "bin" / "push-migrations"
IN_BAND = "set lock_timeout = '3s'; set statement_timeout = '10min';"
SQL = "create view {} as select 1;\n"


def _push_step() -> dict:
    (job,) = _load(WORKFLOWS / "migrate.yml")["jobs"].values()
    return next(s for s in job["steps"] if s.get("name") == "apply what live is missing")


def _settings() -> str:
    """The lines bin/push-migrations puts first in every migration, read from the script itself."""
    return re.search(r"<<'SQL'.*?\n(.*?)\nSQL\n", PUSH.read_text(), re.S)[1]


def _checkout(tmp_path, answers):
    """A checkout holding bin/push-migrations, bin/update-live and two migrations, with a `supabase` that answers each
    try from `answers` ("ok", "lock" for SQLSTATE 55P03, "deadlock" for 40P01, anything else another failure), writes down the first line of
    the migrations it was handed and keeps a copy of them, and a sleep that only writes down that it was called →
    (the checkout, the environment to run it in)."""
    import os
    import shutil

    bin_ = tmp_path / "fakes"
    bin_.mkdir()
    fakes = {
        "sleep": 'echo "sleep $1" >> "$LOG"\n',
        "supabase": 'while [ $# -gt 0 ]; do [ "$1" = --workdir ] && w=$2; shift; done\n'
        'echo "push $(head -qn1 "$w"/supabase/migrations/*.sql | sort -u)" >> "$LOG"\n'
        'rm -rf "$GOT"; cp -r "$w/supabase/migrations" "$GOT"\n'
        'a=$(head -1 "$ANSWERS"); sed -i 1d "$ANSWERS"\n'
        'case "$a" in ok) echo "Finished supabase db push." ;;\n'
        '  lock) echo "ERROR: canceling statement due to lock timeout (SQLSTATE 55P03)"; exit 1 ;;\n'
        '  deadlock) echo "ERROR: deadlock detected (SQLSTATE 40P01)"; exit 1 ;;\n'
        '  *) echo "ERROR: relation \\"x\\" does not exist (SQLSTATE 42P01)"; exit 1 ;; esac\n',
    }
    for name, body in fakes.items():
        (bin_ / name).write_text("#!/usr/bin/env bash\n" + body)
        (bin_ / name).chmod(0o755)
    (tmp_path / "calls").touch()
    (tmp_path / "answers").write_text("\n".join(answers) + "\n")
    checkout = tmp_path / "checkout"
    migrations = checkout / "supabase" / "migrations"
    migrations.mkdir(parents=True)
    shutil.copy(db.REPO_ROOT / "supabase" / "config.toml", checkout / "supabase")
    for name in ("20990101000000_a", "20990102000000_b"):
        (migrations / f"{name}.sql").write_text(SQL.format(name[-1]))
    (checkout / "bin").mkdir()
    for name in ("push-migrations", "update-live"):
        shutil.copy(db.REPO_ROOT / "bin" / name, checkout / "bin")
    env = {
        **{k: v for k, v in os.environ.items() if k != "PGOPTIONS"},
        "PATH": f"{bin_}:{os.environ['PATH']}",
        "LOG": str(tmp_path / "calls"),
        "ANSWERS": str(tmp_path / "answers"),
        "GOT": str(tmp_path / "pushed"),
    }
    return checkout, env


def _push(tmp_path, answers):
    """migrate live's push step run as the runner runs it (`bash -e`, in the checkout) → (exit code, every call in
    order)."""
    import subprocess

    checkout, env = _checkout(tmp_path, answers)
    step = _push_step()
    env = {**env, **step["env"], "LIVE": "postgresql://nobody@127.0.0.1:1/none"}
    done = subprocess.run(
        ["bash", "-e", "-c", step["run"]], env=env, cwd=checkout, capture_output=True, text=True
    )
    return done.returncode, (tmp_path / "calls").read_text().splitlines()


def _pushed() -> str:
    return "push " + _settings()


def _in_band(tmp_path):
    """Each migration as it was pushed: the settings, then the migration as the checkout holds it, unchanged."""
    for migration in (tmp_path / "checkout" / "supabase" / "migrations").glob("*.sql"):
        assert migration.read_text() == SQL.format(migration.stem[-1]), (
            "the checkout's own migration was rewritten"
        )
        assert (
            tmp_path / "pushed" / migration.name
        ).read_text() == _settings() + "\n" + migration.read_text()


def test_a_migration_waits_briefly_for_a_lock_and_long_for_its_work():
    """2026-10-21 12:52 UTC: a view's replacement waited 121 s behind live's readers until live's 2-minute statement
    timeout cancelled it (SQLSTATE 57014), educators' queries on that view queued behind it all the while."""
    assert _settings().startswith(IN_BAND), (
        "a migration still waits on educators' locks, or dies at live's 2 minutes"
    )


def test_the_settings_travel_inside_each_migration_not_with_the_connection(tmp_path):
    """2026-10-22 02:01 and 02:09 UTC (run 39709016021, both attempts): live is reached through Supabase's pooler,
    which does not pass a connection's startup options on, so PGOPTIONS never reached live, and the check that read
    them back over a second connection failed and held the website with nothing to apply. The settings are now the
    first statements of every migration, inside the transaction the push runs it in, whatever the pooler does."""
    code, calls = _push(tmp_path, ["ok"])
    assert code == 0
    assert "PGOPTIONS" not in _push_step()["env"], "the settings still ride on the connection a pooler drops"
    assert calls == [_pushed()], f"{calls}: no push, or a check on a connection other than the migration's"
    _in_band(tmp_path)


def test_a_hand_update_of_live_pushes_the_same_settings(tmp_path):
    """2026-10-22 (L14c): bin/update-live, run by a person, still ran `supabase db push` itself, without the settings,
    so a hand update could queue educators' pages behind a lock as the 12:52 one did. It now runs the same step as
    migrate live, and leaves the checkout's migrations as main has them, for the next `git pull --ff-only`."""
    import subprocess

    checkout, env = _checkout(tmp_path, ["ok"])
    for fake, body in {"git": "", "uv": "", "bin/engine": 'echo "engine $1" >> "$LOG"'}.items():
        path = (tmp_path / "fakes" / fake) if "/" not in fake else (checkout / fake)
        path.write_text(f"#!/usr/bin/env bash\n{body}\n")
        path.chmod(0o755)
    python = checkout / "packages" / "engine" / ".venv" / "bin" / "python"
    python.parent.mkdir(parents=True)
    python.write_text("#!/usr/bin/env bash\n")
    python.chmod(0o755)
    (checkout / ".env").write_text("DATABASE_URL=postgresql://nobody@127.0.0.1:1/none\n")
    done = subprocess.run(
        [checkout / "bin" / "update-live", "--no-server"], env=env, capture_output=True, text=True
    )
    assert done.returncode == 0, done.stdout + done.stderr
    calls = (tmp_path / "calls").read_text().splitlines()
    assert calls[0] == _pushed(), (
        f"{calls[:2]}: the hand update pushed without the settings, or after the engine ran"
    )
    _in_band(tmp_path)


def test_every_path_to_live_pushes_through_one_step():
    """A second copy of the push is how bin/update-live was left without the settings: only bin/push-migrations runs
    `supabase db push`, and migrate live and bin/update-live each run it."""
    runs = [
        path.relative_to(db.REPO_ROOT).as_posix()
        for folder in ("bin", "deploy", ".github/workflows")
        for path in sorted((db.REPO_ROOT / folder).iterdir())
        if path.is_file()
        and any(
            "supabase db push" in line and not line.strip().startswith("#")
            for line in path.read_text().splitlines()
        )
    ]
    assert runs == ["bin/push-migrations", "bin/testdb"], (
        runs
    )  # bin/testdb pushes to the local copy, never to live
    assert _push_step()["run"] == "bin/push-migrations"
    assert 'LIVE="$LIVE" "$REPO/bin/push-migrations"' in (db.REPO_ROOT / "bin" / "update-live").read_text()


def test_the_cli_that_pushes_is_the_version_rehearsed():
    """The settings hold for a migration because the CLI runs its statements and its history row as one batch; that
    was rehearsed on supabase 2.121.0 (docs/notes/l14b-timeouts-in-band.md). `latest` would bring an unrehearsed CLI
    to live on whatever day it changed."""
    (job,) = _load(WORKFLOWS / "migrate.yml")["jobs"].values()
    (cli,) = [s for s in job["steps"] if s.get("uses", "").startswith("supabase/setup-cli")]
    assert cli["with"]["version"] == "2.121.0", (
        f"migrate live's CLI is {cli['with']['version']}, not the one rehearsed"
    )


def test_a_migration_whose_session_lacks_the_settings_stops_before_any_change():
    """The check runs inside the migration's own transaction, on the backend that runs it: with the settings it
    passes; without them it raises, so the migration's transaction rolls back before any change."""
    import psycopg
    import pytest

    settings = _settings()
    with db.connect() as conn:
        conn.execute(settings)
        took = "select current_setting('lock_timeout') as l, current_setting('statement_timeout') as s"
        assert conn.execute(took).fetchone() == {"l": "3s", "s": "10min"}
        conn.execute("reset all")
        with pytest.raises(psycopg.errors.RaiseException, match="did not take lock_timeout 3s"):
            conn.execute(settings.removeprefix(IN_BAND))


def test_a_migration_held_by_a_lock_tries_again_by_itself(tmp_path):
    code, calls = _push(tmp_path, ["lock", "lock", "ok"])
    assert code == 0
    assert [c for c in calls if c.startswith("push ")] == [_pushed()] * 3, calls
    assert calls.count("sleep 20") == 2, calls


def test_a_migration_caught_in_a_deadlock_tries_again_by_itself(tmp_path):
    """2026-10-22 17:32 UTC, migrate live, B4's migration: "deadlock detected (SQLSTATE 40P01)" — it held one table's
    lock and waited for another that a reader of live held, the reader waiting on it. Postgres rolled the migration
    back whole, as for a lock it could not have, so it is tried again the same way."""
    code, calls = _push(tmp_path, ["deadlock", "lock", "ok"])
    assert code == 0
    assert [c for c in calls if c.startswith("push ")] == [_pushed()] * 3, calls
    assert calls.count("sleep 20") == 2, calls


def test_a_migration_that_fails_for_another_reason_stops_at_once(tmp_path):
    code, calls = _push(tmp_path, ["other", "ok"])
    assert code == 1
    assert [c for c in calls if c.startswith(("push", "sleep"))] == [_pushed()]


def test_a_migration_still_held_after_six_tries_fails(tmp_path):
    code, calls = _push(tmp_path, ["lock"] * 7)
    assert code == 1
    assert sum(c.startswith("push") for c in calls) == 6, calls


def test_the_model_key_reaches_the_server_from_the_repositorys_secret():
    """From 29 Sep the server's .env had no ANTHROPIC_API_KEY and every model call failed quietly for three weeks
    (PR #248). Each deploy now writes the repository's secret into .env, over ssh on stdin so no log or command line
    carries it, and a server still without it is a warning on the run (goals/k1-the-server-has-the-model-key.yaml)."""
    steps = _load(WORKFLOWS / "deploy-engine.yml")["jobs"]["deploy"]["steps"]
    names = [s.get("name", "") for s in steps]
    step = steps[names.index("the model key, from the repository's secret")]
    assert names.index("the model key, from the repository's secret") < names.index("start the engine")
    assert step["if"] == GATED
    assert step["env"]["ANTHROPIC_API_KEY"] == "${{ secrets.ANTHROPIC_API_KEY }}"
    script = step["run"]
    assert "printf '%s' \"$ANTHROPIC_API_KEY\" | $S" in script, "the key goes on stdin"
    assert 'echo "$ANTHROPIC_API_KEY' not in script and '$S "' not in script, "the key on a command line"
    assert 'grep -v "^ANTHROPIC_API_KEY="' in script, "an old key line is replaced, not doubled"
    assert "::warning::the server has no ANTHROPIC_API_KEY" in script


def test_every_deploy_loads_the_frameworks_from_the_files_of_the_commit_deployed():
    # CP-54: `engine load --settings` runs on every deploy and loads the frameworks; inside the image REPO_ROOT is
    # /app, so the crosswalk and the spine must be mounted where frameworks.py reads them
    from engine.core import cambridge_words, frameworks

    inside = db._repo_root_for(Path("/app/engine/core/db.py"))
    volumes = _load(db.REPO_ROOT / "deploy" / "compose.server.yml")["services"]["engine"]["volumes"]
    mounted = {str(Path(v.split(":")[1])): v for v in volumes}
    # every path the loaders read (the tables, the spine, and the file the Cambridge reader is configured by) sits at or
    # under a read-only mount whose source is the same folder of the repository
    for read in (frameworks.TABLES, frameworks.SPINE, cambridge_words.SOURCES):
        where = inside / read.relative_to(db.REPO_ROOT)
        cover = next((m for m in mounted if where == Path(m) or Path(m) in where.parents), None)
        assert cover and mounted[cover].endswith(":ro"), str(where)
        assert mounted[cover].split(":")[0] == "../" + str(Path(cover).relative_to(inside))
    assert (
        "frameworks.load(conn, t)"
        in (db.REPO_ROOT / "packages/engine/engine/core/loaders.py")
        .read_text()
        .split("def load_settings", 1)[1]
    )


# A deploy replaces the engine's container, and what `curriculum run` started in it with `docker exec` dies with it (exit 137): the deploy of #807
# ended a paid skill_goods run part-way (16 Nov 2026). The deploy waits, as it waits for a scan being read, and never stops anything itself.
COMMAND = db.REPO_ROOT / ".github" / "curriculum" / "command.py"
RUNNING = db.REPO_ROOT / "deploy" / "commands_running.py"


def _module(path: Path, name: str):
    import importlib.util

    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _proc(tmp_path, *lines: str):
    """A folder laid out as /proc is: a numbered folder for each process, its command line in `cmdline` with NULs between the words
    (and `self`, which is not a process)."""
    proc = tmp_path / "proc"
    proc.mkdir()
    (proc / "self").mkdir()
    for pid, line in enumerate(lines, start=100):
        (proc / str(pid)).mkdir()
        (proc / str(pid) / "cmdline").write_bytes(b"\0".join(w.encode() for w in line.split()) + b"\0")
    return str(proc)


def test_the_commands_the_deploy_waits_for_are_found_by_their_first_two_words(tmp_path):
    running = _module(RUNNING, "commands_running").running
    proc = _proc(
        tmp_path,
        "python /usr/local/bin/engine skill seed-goods activity",  # how the console script shows in the container
        "engine curriculum draft --stage draft --by someone@school.invalid",
        "uvicorn engine.api.app:app --host 0.0.0.0 --port 8000",  # the engine serving: not a command
        "python /usr/local/bin/engine load --settings",  # quick, and the deploy runs it itself
        "python /usr/local/bin/engine bank make",  # not one of the curriculum run's
        "python - curriculum skill",  # the asking itself: the words are its arguments, not a command line
    )
    words = {"curriculum", "skill"}
    assert sorted(running(words, proc, own=1)) == ["engine curriculum", "engine skill"]
    assert running(words, proc, own=100) == ["engine curriculum"], "the process asking is not counted"
    # never the rest of a line: a person's email can be in it, and the log is public
    assert all("@" not in c for c in running(words, proc, own=1))


def test_every_engine_command_the_curriculum_run_can_start_is_waited_for(tmp_path):
    """Taken from the run's own list: a run added to command.py is waited for with nothing else changed."""
    cmd = _module(COMMAND, "curriculum_command")
    running = _module(RUNNING, "commands_running").running
    words = set(cmd.watched())
    seen = 0
    for name, run in cmd.RUNS.items():
        for c in run["commands"]:
            if c[0] != "engine" or c[1] == "load":
                continue
            proc_dir = tmp_path / name.replace("_", "-") / str(seen)
            proc_dir.mkdir(parents=True)
            line = "python /usr/local/bin/engine " + " ".join(c[1:])
            assert running(words, _proc(proc_dir, line), own=1) == [f"engine {c[1]}"], f"{name}: {line}"
            seen += 1
    assert seen > 40 and "skill" in words and "curriculum" in words, words


def _wait_step() -> dict:
    (job,) = _load(WORKFLOWS / "deploy-engine.yml")["jobs"].values()
    steps = job["steps"]
    names = [s.get("name") for s in steps]
    at = names.index("wait for curriculum commands")
    assert at < names.index("start the engine"), "the engine is replaced before the commands are waited for"
    assert at > names.index("a way in"), "it asks before there is a way in"
    return steps[at]


def test_the_deploy_waits_for_curriculum_commands_before_it_replaces_the_engine():
    step = _wait_step()
    assert step["if"] == GATED, "waits on a deploy that is not going to happen"
    run = step["run"]
    assert "command.py --watch" in run and "deploy/commands_running.py" in run, (
        "it does not ask the engine about the run's own commands"
    )
    assert "seq " in run and run.rstrip().endswith("exit 1"), "no limit, or one that does not fail the deploy"
    assert "::error::" in run and "untouched" in run, "a timeout that does not say so"
    # it only asks: nothing that stops, kills or restarts anything
    assert not re.search(r"docker (stop|kill|rm|restart|compose)|\bkill\b|pkill|systemctl", run), (
        "it can end the run it waits for"
    )


FAKE_SSH = """#!/usr/bin/env bash
cmd="${@: -1}"
echo "ssh $cmd" >> "$LOG"
case "$cmd" in
  *"docker exec"*)
    cat > /dev/null
    [ -n "${EXEC_RC:-}" ] && exit "$EXEC_RC"
    first=$(head -1 "$ANSWERS"); [ "$(wc -l < "$ANSWERS")" -gt 1 ] && sed -i 1d "$ANSWERS"; echo "$first" ;;
  *"docker ps"*) echo "${UP:-}"; exit "${PS_RC:-0}" ;;
esac
"""


def _wait(tmp_path, answers=("0",), exec_rc="", up="", ps_rc="0", tries="3"):
    """The step's own script, run as the runner runs it with an ssh that writes down what it was asked and answers from `answers`, one
    for each ask (the last again and again), and a sleep that only writes down that it was called → (exit code, output, the calls)."""
    import os
    import subprocess

    tmp_path = tmp_path / f"ask{len(list(tmp_path.iterdir()))}"  # a test may ask more than once
    tmp_path.mkdir()
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    (bin_ / "ssh").write_text(FAKE_SSH)
    (bin_ / "sleep").write_text('#!/usr/bin/env bash\necho "sleep $1" >> "$LOG"\n')
    for f in bin_.iterdir():
        f.chmod(0o755)
    log, ans = tmp_path / "calls", tmp_path / "answers"
    log.touch()
    ans.write_text("\n".join(answers) + "\n")
    env = {
        **os.environ,
        "PATH": f"{bin_}:{os.environ['PATH']}",
        "LOG": str(log),
        "ANSWERS": str(ans),
        "HOST": "server.invalid",
        "EXEC_RC": exec_rc,
        "UP": up,
        "PS_RC": ps_rc,
        "CURRICULUM_WAIT_TRIES": tries,
    }
    done = subprocess.run(
        ["bash", "-e", "-c", _wait_step()["run"]], cwd=db.REPO_ROOT, env=env, capture_output=True, text=True
    )
    return done.returncode, done.stdout + done.stderr, log.read_text().splitlines()


def test_a_deploy_goes_on_once_the_command_it_waited_for_has_ended(tmp_path):
    code, out, calls = _wait(tmp_path, answers=("1 engine skill", "1 engine skill", "0"))
    assert code == 0, out
    assert out.count("still running (engine skill); waiting") == 2, out
    assert [c for c in calls if c.startswith("sleep")] == ["sleep 30"] * 2
    asked = [c for c in calls if c.startswith("ssh")]
    assert len(asked) == 3 and all("docker exec -i deploy-engine-1 python - " in c for c in asked), asked
    assert "curriculum" in asked[0] and "skill" in asked[0], "it does not name the words to watch"


def test_a_command_still_running_at_the_limit_fails_the_deploy_and_is_left_alone(tmp_path):
    code, out, calls = _wait(tmp_path, answers=("2 engine curriculum engine skill",), tries="4")
    assert code == 1
    assert "::error::" in out and "was still running after 130 minutes" in out and "untouched" in out, out
    assert len([c for c in calls if c.startswith("ssh")]) == 4, "it did not ask every time round"
    assert all("docker exec -i deploy-engine-1 python - " in c for c in calls if c.startswith("ssh")), (
        "it did more than ask"
    )


def test_a_server_that_cannot_be_asked_does_not_pass_for_one_with_nothing_running(tmp_path):
    code, out, _ = _wait(tmp_path, exec_rc="255")
    assert code == 1 and "could not reach the server" in out, out
    code, out, _ = _wait(tmp_path, exec_rc="1", up="abc123")  # the engine is up and would not answer
    assert code == 1 and "could not ask the running engine" in out, out
    code, out, _ = _wait(tmp_path, exec_rc="1", up="", ps_rc="1")  # not even docker answered
    assert code == 1 and "could not ask the server" in out, out


def test_a_deploy_with_no_engine_running_has_nothing_to_wait_for(tmp_path):
    code, out, calls = _wait(
        tmp_path, exec_rc="1", up=""
    )  # the first deploy to a server: there is no container to ask
    assert code == 0 and "no command to wait for" in out, out
    assert not any(c.startswith("sleep") for c in calls)


READ_ONLY = {"engine-logs.yml", "watch-live.yml"}  # they only ask the engine: nothing a deploy would cut off
GROUP = {"group": "engine-server", "cancel-in-progress": False}


def _execs_into_the_engine() -> list[Path]:
    """Every workflow that runs something in the serving engine with `docker exec`, but the ones that only read."""
    return sorted(
        p for p in WORKFLOWS.glob("*.yml") if "docker exec" in p.read_text() and p.name not in READ_ONLY
    )


def test_every_workflow_that_runs_in_the_engine_shares_the_engines_group_and_migrate_stays_out_of_it():
    """Replacing the engine kills what a workflow started in it with `docker exec` (exit 137, 16 Nov 2026: a paid `skill_goods` run of
    `curriculum run`): they share one concurrency group, so each queues behind the others on GitHub, with no gap between a wait and a start.
    None cancels another. A group holds one running and one pending run, a newer pending run replacing the older one (docs.github.com, Using
    concurrency): a deploy replaced by the next merge's deploy is as it was (newest wins), a dispatch replaced by a newer one reads as cancelled
    and is dispatched again. A new workflow that execs into the engine and forgets the group fails here."""
    execs = _execs_into_the_engine()
    names = {p.name for p in execs}
    assert {
        "deploy-engine.yml",
        "curriculum-run.yml",
        "timetable-run.yml",
        "engine-eval.yml",
        "write-reports.yml",
        "reader-ink.yml",
    } <= names, names
    for p in execs:
        assert _load(p).get("concurrency") == GROUP, f"{p.name} runs in the engine outside the engine's group"
    # migrate live waits on nothing the engine does, and the engine's deploy waits for it by asking live, not through a group
    assert _load(WORKFLOWS / "migrate.yml")["concurrency"]["group"] != GROUP["group"], (
        "migrate live queues behind the engine"
    )
    # the ones that only read are not held behind a run that lasts hours
    for name in READ_ONLY:
        assert _load(WORKFLOWS / name).get("concurrency", {}).get("group") != GROUP["group"], name


def test_the_deploy_waits_for_every_command_the_workflows_start_in_the_engine():
    """The words `--watch` gives are the run list's (command.py) and WORKFLOW_RUNS, the other workflows' own; what each workflow's file says it
    runs must be among them, and every workflow that execs into the engine (the deploy's own and `curriculum run`, whose list is RUNS, apart)
    must have an entry: a new long workflow that forgets it fails here."""
    cmd = _module(COMMAND, "curriculum_command")
    watched = set(cmd.watched())
    others = [
        p for p in _execs_into_the_engine() if p.name not in ("deploy-engine.yml", "curriculum-run.yml")
    ]
    assert sorted(cmd.WORKFLOW_RUNS) == sorted(p.name for p in others), (
        "a workflow that execs into the engine and the table disagree"
    )
    for p in others:
        literal = re.findall(r"docker exec (?:-i )?deploy-engine-1 engine (\w+)", p.read_text())
        assert set(literal) <= set(cmd.WORKFLOW_RUNS[p.name]), (p.name, literal)
        assert set(cmd.WORKFLOW_RUNS[p.name]) <= watched, p.name
    # the commands that reach the shell by a variable, from the lists that make them
    timetable = _module(db.REPO_ROOT / ".github" / "timetable" / "command.py", "timetable_command")
    assert {c[1] for run in timetable.RUNS.values() for c in run["commands"]} <= watched
    assert (
        '"engine", "eval"' in (db.REPO_ROOT / ".github" / "eval" / "command.py").read_text()
        and "eval" in watched
    )
    assert "report" in watched, "write-reports' `engine report` is cut off by a deploy and is not waited for"


# --- CP-73: a green commit goes live even when a newer merge has landed (ADR 0074, last paragraph) -------------------
X, TIP = "a" * 40, "b" * 40


def _step(name_or_id: str) -> dict:
    (job,) = _load(WORKFLOWS / "migrate.yml")["jobs"].values()
    return next(s for s in job["steps"] if name_or_id in (s.get("id"), s.get("name")))


def _status_step() -> dict:
    (job,) = _load(WORKFLOWS / "migrate.yml")["jobs"].values()
    return job["steps"][-1]


def _run_step(
    tmp_path, step, *, tip=TIP, live=None, x=("1", "2"), newer=(), released=(), event="workflow_run", env=None
):
    """One step of migrate live run as the runner runs it (`bash -e`, in a checkout of X) with fakes for git (main's tip),
    psql (live's migration list; `None` = live cannot be asked) and gh (the commits after X on main, which of them
    already have a green `live database`, and every status written) → (exit code, log, outputs, calls)."""
    import os
    import subprocess

    tmp_path.mkdir(exist_ok=True)
    fakes = tmp_path / "fakes"
    fakes.mkdir()
    calls, outputs = tmp_path / "calls", tmp_path / "outputs"
    calls.touch()
    outputs.touch()
    (tmp_path / "live").write_text("\n".join(live or []) + "\n")
    (tmp_path / "newer").write_text("\n".join(newer) + "\n")
    (tmp_path / "released").write_text("\n".join(released) + "\n")
    bodies = {
        "git": f'echo "git $*" >> "$CALLS"\nprintf "{tip}\\trefs/heads/main\\n"\n',
        "psql": 'echo "psql" >> "$CALLS"\n' + ("exit 1\n" if live is None else 'cat "$DIR/live"\n'),
        "gh": 'echo "gh $*" >> "$CALLS"\n'
        'case "$2" in\n'
        '  */compare/*) cat "$DIR/newer" ;;\n'
        '  */commits/*/statuses) c=${2#*/commits/}; c=${c%/statuses}; grep -qx "$c" "$DIR/released" && echo success ;;\n'
        "esac\nexit 0\n",
        "sudo": "exit 1\n",
    }
    for name, body in bodies.items():
        (fakes / name).write_text("#!/usr/bin/env bash\n" + body)
        (fakes / name).chmod(0o755)
    checkout = tmp_path / "checkout"
    migrations = checkout / "supabase" / "migrations"
    migrations.mkdir(parents=True)
    for v in x:
        (migrations / f"{v}_m.sql").write_text("select 1;\n")
    run_env = {
        **os.environ,
        "PATH": f"{fakes}:{os.environ['PATH']}",
        "CALLS": str(calls),
        "DIR": str(tmp_path),
        "GITHUB_OUTPUT": str(outputs),
        "GITHUB_REPOSITORY": "o/r",
        "GITHUB_SERVER_URL": "https://github.com",
        "GITHUB_RUN_ID": "1",
        "SHA": X,
        "EVENT": event,
        "LIVE": "postgresql://nobody@127.0.0.1:1/none",
        "GH_TOKEN": "t",
        **(env or {}),
    }
    done = subprocess.run(
        ["bash", "-e", "-c", step["run"]], env=run_env, cwd=checkout, capture_output=True, text=True
    )
    out = dict(line.split("=", 1) for line in outputs.read_text().splitlines())
    return done.returncode, done.stdout, out, calls.read_text().splitlines()


def test_a_green_commit_main_has_moved_on_from_is_released_when_live_has_all_its_migrations(tmp_path):
    code, log, out, calls = _run_step(tmp_path, _step("plan"), live=["1", "2", "3"], newer=[TIP])
    assert code == 0
    assert out["go"] == "no", "a commit that is not main's newest must never push migrations"
    assert out["release"] == "yes"
    assert f"{X[:7]} is released" in log and f"main has moved on to {TIP[:7]}" in log
    assert "live already has all 2 of its migrations" in log


def test_a_green_commit_carrying_a_migration_live_lacks_waits_for_the_newer_run(tmp_path):
    code, log, out, calls = _run_step(tmp_path, _step("plan"), live=["1"], newer=[TIP])
    assert code == 0
    assert out["go"] == "no" and "release" not in out
    assert "live lacks 2" in log and f"{TIP[:7]}'s own run applies" in log


def test_a_commit_is_not_released_after_a_newer_one_already_has(tmp_path):
    """The website never steps back to older code (ADR 0074, 3)."""
    code, log, out, calls = _run_step(
        tmp_path, _step("plan"), live=["1", "2"], newer=["c" * 40, TIP], released=["c" * 40]
    )
    assert code == 0 and out["go"] == "no" and "release" not in out
    assert f"{'c' * 7} is already released" in log


def test_a_commit_is_not_released_when_live_cannot_be_asked(tmp_path):
    code, log, out, calls = _run_step(tmp_path, _step("plan"), live=None, newer=[TIP])
    assert code == 0 and out["go"] == "no" and "release" not in out
    assert "could not ask live" in log


def test_mains_newest_commit_plans_exactly_as_before(tmp_path):
    code, log, out, calls = _run_step(tmp_path, _step("plan"), tip=X, live=["1"], newer=[])
    assert code == 0 and out == {"go": "yes"}
    assert not [c for c in calls if c.startswith(("psql", "gh"))], "the tip's own run asks nothing extra"
    code, log, out, calls = _run_step(tmp_path / "d", _step("plan"), event="workflow_dispatch", live=["1"])
    assert out == {"go": "yes"}


def test_only_the_tips_run_pushes_migrations_and_a_red_ci_sets_no_status():
    (job,) = _load(WORKFLOWS / "migrate.yml")["jobs"].values()
    assert "workflow_run.conclusion == 'success'" in job["if"], (
        "a red CI must start nothing, whatever main's tip is"
    )
    steps = job["steps"]
    push = next(s for s in steps if s.get("run") == "bin/push-migrations")
    assert push["if"] == GATED, "db push must run only for main's newest commit"
    assert "release" not in push["if"]


def test_a_released_commit_gets_its_green_status_and_a_plain_words_line(tmp_path):
    step = _status_step()
    assert "steps.plan.outputs.release == 'yes'" in step["if"] and GATED in step["if"]
    env = {"STATE": "success", "GO": "no"}
    code, log, out, calls = _run_step(tmp_path, step, env=env)
    assert code == 0
    gh = next(c for c in calls if c.startswith("gh api"))
    assert f"statuses/{X}" in gh and "state=success" in gh and "context=live database" in gh
    assert f"{X[:7]} is released" in log and "already has" in log


def test_the_tips_status_is_unchanged(tmp_path):
    code, log, out, calls = _run_step(tmp_path, _status_step(), env={"STATE": "success", "GO": "yes"})
    assert "live has this commit's migrations; the website may go live" in " ".join(calls)
