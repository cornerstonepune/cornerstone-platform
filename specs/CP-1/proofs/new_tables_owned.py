"""CP-1 item 6 (first half): every table a CP-1 migration creates has its owner named in the data register
(supabase/seed/data_register.json, an entry's `tables`) or in the map (workflows.json).

CP-1's migrations are those not in migrations_before.txt, the list taken when these proofs were written. A table is
`schema.name` (public when unqualified). Passes with nothing to check when CP-1 creates no table.
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
before = set((Path(__file__).parent / "migrations_before.txt").read_text().split())
new = sorted(p for p in (ROOT / "supabase/migrations").glob("*.sql") if p.name not in before)
CREATE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)", re.I)

register = {t for e in json.loads((ROOT / "supabase/seed/data_register.json").read_text())["data_register"]
            for t in e["tables"]}
map_text = (ROOT / "workflows.json").read_text()

missing = []
for m in new:
    for name in CREATE.findall(re.sub(r"--[^\n]*", "", m.read_text())):
        full = name.lower() if "." in name else f"public.{name.lower()}"
        bare = full.split(".", 1)[1]
        if full not in register and not re.search(rf"\b{re.escape(bare)}\b", map_text):
            missing.append(f"{full} ({m.name})")

print(f"CP-1 migrations: {len(new)}; tables with no named owner: {len(missing)}")
for x in missing:
    print("  no owner in data_register.json or workflows.json:", x)
sys.exit(1 if missing else 0)
