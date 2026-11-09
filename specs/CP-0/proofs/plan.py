#!/usr/bin/env python3
"""CP-0 proofs. Standard library only; run from the repository root.

  plan.py next-id        criterion 1: config id_prefix is CP; `athena next-id` on a copy with no spec folders prints CP-1
  plan.py issues         criterion 2: the plan lists exactly CP-1..CP-19 and each has an issue titled with its ID
  plan.py no-status      criterion 3: no status words in the plan's scope table
  plan.py handoff        criterion 4: HANDOFF points to the plan as the list of what remains, under 50 lines
  plan.py fetch-titles   writes specs/CP-0/issue-titles.json from GitHub's public API (not a proof; run by hand)

Issue titles for criterion 2 come from, in order:
  1. $CP0_ISSUE_TITLES_JSON, a path to a JSON file (e.g. `gh issue list --state all --limit 1000 --json number,title`);
  2. otherwise the committed snapshot specs/CP-0/issue-titles.json, made by `plan.py fetch-titles`.
The proof itself never touches the network, so it runs offline and in CI without a token.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("ATHENA_ROOT") or Path.cwd()).resolve()
PLAN = ROOT / "docs" / "backend-plan.md"
HANDOFF = ROOT / "docs" / "HANDOFF.md"
SNAPSHOT = ROOT / "specs" / "CP-0" / "issue-titles.json"
REPO = "cornerstonepune/cornerstone-platform"
EXPECTED = [f"CP-{n}" for n in range(1, 20)]
STATUS_WORDS = re.compile(r"\b(done|merged|in progress|blocked)\b", re.I)


def fail(msg):
    print(msg)
    sys.exit(1)


def scope_table():
    """Rows (lists of cells) of the plan's table whose header's first cell is 'ID'; header row included."""
    rows, inside = [], False
    for line in PLAN.read_text().splitlines():
        s = line.strip()
        if not s.startswith("|"):
            if inside:
                break
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if not inside:
            if cells[0] == "ID":
                inside = True
                rows.append(cells)
            continue
        if not set(s) <= set("|-: "):
            rows.append(cells)
    if not rows:
        fail(f"{PLAN.relative_to(ROOT)}: no table with an 'ID' column")
    return rows


def next_id():
    cfg = json.loads((ROOT / ".claude" / "athena" / "config.json").read_text())
    if cfg.get("id_prefix") != "CP":
        fail(f'config.json id_prefix is {cfg.get("id_prefix")!r}, expected "CP"')
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copytree(ROOT / ".claude" / "athena", Path(tmp) / ".claude" / "athena")
        (Path(tmp) / "specs").mkdir()
        env = {k: v for k, v in os.environ.items() if k != "CLAUDE_PROJECT_DIR"}
        env["ATHENA_ROOT"] = tmp
        p = subprocess.run([sys.executable, str(Path(tmp) / ".claude/athena/bin/athena"), "next-id"],
                           cwd=tmp, env=env, capture_output=True, text=True, timeout=60)
    if p.returncode != 0 or p.stdout.strip() != "CP-1":
        fail(f"athena next-id on an empty checkout: exit {p.returncode}, printed {p.stdout.strip()!r} {p.stderr.strip()}")
    print("next-id: CP-1")


def titles():
    src = os.environ.get("CP0_ISSUE_TITLES_JSON")
    path = Path(src) if src else SNAPSHOT
    if not path.is_file():
        fail(f"no issue titles: set CP0_ISSUE_TITLES_JSON or run `python3 specs/CP-0/proofs/plan.py fetch-titles` ({path})")
    data = json.loads(path.read_text())
    items = data["issues"] if isinstance(data, dict) else data
    print(f"issue titles from {path} ({len(items)} issues)")
    return [i["title"] if isinstance(i, dict) else str(i) for i in items]


def issues():
    ids = [r[0] for r in scope_table()[1:]]
    if ids != EXPECTED:
        fail(f"plan lists {ids}, expected exactly {EXPECTED}")
    all_titles = titles()
    missing = [i for i in ids if not any(re.match(rf"{re.escape(i)}(?!\d)", t) for t in all_titles)]
    if missing:
        fail(f"no GitHub issue whose title starts with: {missing}")
    print("plan = CP-1..CP-19, each with an issue")


def no_status():
    bad = [" | ".join(r) for r in scope_table() if STATUS_WORDS.search(" ".join(r))]
    if bad:
        fail("status words in the plan's table:\n" + "\n".join(bad))
    print("no status words in the table")


def handoff():
    lines = HANDOFF.read_text().splitlines()
    if len(lines) >= 50:
        fail(f"HANDOFF.md has {len(lines)} lines, must be under 50")
    if not any("docs/backend-plan.md" in l and "remain" in l.lower() for l in lines):
        fail("HANDOFF.md has no line pointing to docs/backend-plan.md as the list of what remains")
    print(f"HANDOFF.md: {len(lines)} lines, points to the plan")


def fetch_titles():
    """Snapshot every issue title from GitHub's public REST API into specs/CP-0/issue-titles.json."""
    out, page = [], 1
    while True:
        url = f"https://api.github.com/repos/{REPO}/issues?state=all&per_page=100&page={page}"
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})) as r:
            batch = json.load(r)
        out += [{"number": i["number"], "title": i["title"]} for i in batch if "pull_request" not in i]
        if len(batch) < 100:
            break
        page += 1
    SNAPSHOT.write_text(json.dumps({"source": f"https://api.github.com/repos/{REPO}/issues?state=all",
                                    "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                                    "issues": out}, indent=1) + "\n")
    print(f"wrote {len(out)} issue titles to {SNAPSHOT}")


if __name__ == "__main__":
    cmds = {"next-id": next_id, "issues": issues, "no-status": no_status, "handoff": handoff, "fetch-titles": fetch_titles}
    if len(sys.argv) != 2 or sys.argv[1] not in cmds:
        fail(f"usage: plan.py {{{'|'.join(cmds)}}}")
    cmds[sys.argv[1]]()
