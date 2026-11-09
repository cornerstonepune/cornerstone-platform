"""CP-10 item 3, LIVE (box only, read-only): once the clean-up flow is imported on the box, no note older than 51 hours
(48 and the longest gap between two runs, with an hour's room) still has its transcript, and no recording file under the
engine's recordings folder is older than 51 hours.

Reads the live database through DATABASE_URL (or the repository's .env) in a read-only transaction, and lists the
recordings folder (VOICE_DIR, default ~/cornerstone/data/voice, the host folder the engine's /app/data/voice is,
deploy/compose.server.yml). Prints counts only: never a note id, a transcript, a file name or a name.
A missing folder passes only while no note has ever been received (recording never switched on).
"""

import os
import sys
import time
from pathlib import Path

import psycopg

HOURS = 51
ROOT = Path(__file__).resolve().parents[3]


def _url() -> str | None:
    url = os.environ.get("DATABASE_URL")
    env = ROOT / ".env"
    if not url and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip().strip("'\"")
    return url


def main() -> int:
    url = _url()
    if not url:
        print("DATABASE_URL is not set: the live check needs the production database")
        return 1
    with psycopg.connect(url, options="-c default_transaction_read_only=on", connect_timeout=15) as conn:
        kept, notes = conn.execute(
            "select count(*) filter (where transcript is not null and received_at < now() - make_interval(hours => %s)),"
            " count(*) from pii.educator_note", (HOURS,)).fetchone()
    folder = Path(os.environ.get("VOICE_DIR", Path.home() / "cornerstone" / "data" / "voice"))
    fails = []
    if folder.is_dir():
        cut = time.time() - HOURS * 3600
        old = sum(1 for f in folder.rglob("*") if f.is_file() and f.stat().st_mtime < cut)
        print(f"recordings folder: {old} files older than {HOURS} hours")
        if old:
            fails.append(f"{old} recording files older than {HOURS} hours")
    else:
        print(f"recordings folder: not there; notes ever received: {notes}")
        if notes:
            fails.append("notes were received but the recordings folder cannot be read")
    print(f"notes older than {HOURS} hours that still have their transcript: {kept}")
    if kept:
        fails.append(f"{kept} notes older than {HOURS} hours still have their transcript")
    for f in fails:
        print("FAIL:", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
