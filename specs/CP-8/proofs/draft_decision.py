"""CP-8 item 5: a decision is recorded on whether a draft marked "not written yet" may be shown to educators.

The design (Decisions for Nimish, 2) names the record: docs/decisions/CP-8-not-written-draft.md, with one line
`Decision: show | hide | school-text-only` and one line `Decided-by: <who>`. The choice is Nimish's; this proof checks
only that it is recorded, never which option it is.
"""

import os
import re
import sys
from pathlib import Path

ROOT = Path(os.environ.get("ATHENA_ROOT", Path(__file__).resolve().parents[3]))
RECORD = ROOT / "docs" / "decisions" / "CP-8-not-written-draft.md"

if not RECORD.is_file():
    sys.exit(f"no decision recorded: {RECORD.relative_to(ROOT)} does not exist")
text = RECORD.read_text()
decision = re.findall(r"^Decision:[ \t]*(show|hide|school-text-only)[ \t]*$", text, re.M | re.I)
if len(decision) != 1:
    sys.exit(
        "the record needs exactly one line 'Decision: show', 'Decision: hide' or 'Decision: school-text-only'"
    )
if not re.search(r"^Decided-by:[ \t]*\S", text, re.M | re.I):
    sys.exit("the record does not say who decided (a 'Decided-by:' line)")
print(f"decision recorded: {decision[0].lower()}")
