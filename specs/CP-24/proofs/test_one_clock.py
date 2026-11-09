"""CP-24 item 1 (the repository's text): no new migration says `current_date`, and the zone string
"Asia/Kolkata" is in no tracked file of the engine's code or the website's `lib` and `app` (the seed, n8n and deploy
files may name it). Git's list (tracked and not yet added, never ignored), so no node_modules or build output.

"New" is every migration numbered after 20270125120000, the newest on main when these proofs were written (CP-6's
fortnight cycle). Its one-off backfill (`ends_on >= current_date`) and the audited `hand_check` default of
20270125090000 are already applied and are not edited (rule 9); the new migration supersedes the second, which
test_school_day.py proves on the database.
"""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
LAST_OLD = "20270125120000"  # the newest migration on main when these proofs were written; every one after is new
CURRENT_DATE = re.compile(r"\bcurrent_date\b", re.I)
ZONE = "Asia/Kolkata"


def _tracked(*paths: str) -> list[str]:
    out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", *paths], cwd=ROOT, capture_output=True, text=True, check=True)
    return out.stdout.split()


def test_1_no_current_date_in_a_new_migration():
    migrations = [f for f in _tracked("supabase/migrations") if f.endswith(".sql")]
    assert migrations, "git listed no migrations"
    newer = [f for f in migrations if re.match(r"\d{14}", Path(f).name) and Path(f).name[:14] > LAST_OLD]
    hits = [
        f"{f}:{n}: {line.strip()}"
        for f in newer
        for n, line in enumerate((ROOT / f).read_text(errors="replace").splitlines(), 1)
        if CURRENT_DATE.search(line.split("--")[0])  # SQL a comment only describes computes nothing
    ]
    assert not hits, "a new migration takes the date from the server's clock:\n" + "\n".join(hits)


def test_1_no_hard_coded_zone_in_engine_or_website_code():
    files = _tracked("packages/engine/engine", "apps/web/lib", "apps/web/app")
    assert files, "git listed no engine or website files"
    hits = [
        f"{f}:{n}: {line.strip()}"
        for f in files
        if (ROOT / f).is_file()
        for n, line in enumerate((ROOT / f).read_text(errors="replace").splitlines(), 1)
        if ZONE in line
    ]
    assert not hits, f'"{ZONE}" is hard-coded outside the seed:\n' + "\n".join(hits)
