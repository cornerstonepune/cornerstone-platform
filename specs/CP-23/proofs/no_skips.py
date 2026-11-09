"""Reads pytest -v output on stdin; exits 0 only when every test of each named file ran (some outcome other than
SKIPPED), and each file has at least one test reported."""

import re
import sys

out = sys.stdin.read()
line = re.compile(r"(\S*?)(test_\w+\.py)::(\w+)(?:\[[^\]]*\])?\s+(PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS)")
seen: dict[tuple[str, str], set[str]] = {}
for m in line.finditer(out):
    seen.setdefault((m.group(2), m.group(3)), set()).add(m.group(4))
bad = []
for f in sys.argv[1:]:
    tests = {t: o for (ff, t), o in seen.items() if ff == f}
    if not tests:
        bad.append(f"{f}: no test of it was reported run")
    bad += [f"{f}::{t} only ever SKIPPED" for t, o in sorted(tests.items()) if o <= {"SKIPPED"}]
    print(f"{f}: {len(tests)} tests reported, outcomes {sorted(set().union(*tests.values())) if tests else []}")
if bad:
    print(*bad, sep="\n")
    sys.exit(1)
