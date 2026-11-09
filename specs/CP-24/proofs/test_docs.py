"""CP-24 items 6 and 7: the written backup plan and the backend plan's new rule.

Item 6: `docs/backup.md` states the Supabase backup or point-in-time setting, the Lightsail snapshot retention, a
restore drill onto the test database with the date it was run (YYYY-MM-DD), and the 48-hour voice promise (Audit F10).
Item 7: `docs/backend-plan.md` has a rule that a Core scope a screen will call ships one keyed route beside its command
(Audit F6).
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def _read(name: str) -> str:
    p = ROOT / "docs" / name
    assert p.is_file(), f"docs/{name} does not exist"
    return p.read_text()


def test_6_backup_plan_states_supabase_lightsail_drill_and_48_hours():
    text = _read("backup.md")
    low = text.lower()
    missing = [
        what
        for what, ok in (
            ("Supabase", "supabase" in low),
            ("its backup or point-in-time (archive) setting", re.search(r"point-in-time|pitr|archive", low)),
            ("Lightsail", "lightsail" in low),
            ("the Lightsail snapshot", "snapshot" in low),
            ("a retention", "retention" in low or "retain" in low or "kept for" in low),
            ("a restore drill", "restore" in low and "drill" in low),
            ("the test database", re.search(r"test database|engine_test", low)),
            ("the drill's date (YYYY-MM-DD)", re.search(r"\b20\d\d-\d\d-\d\d\b", text)),
            ("the 48-hour voice promise", re.search(r"\b48\b", text) and "voice" in low),
        )
        if not ok
    ]
    assert not missing, "docs/backup.md does not state: " + "; ".join(missing)


def test_7_backend_plan_has_the_keyed_route_rule():
    text = _read("backend-plan.md")
    rules = [para for para in re.split(r"\n\s*\n", text) if "keyed route" in para.lower()]
    assert rules, 'docs/backend-plan.md has no rule naming a "keyed route"'
    assert any("screen" in r.lower() for r in rules), "the keyed-route rule does not say it is for what a screen calls"
