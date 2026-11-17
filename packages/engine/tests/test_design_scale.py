"""CP-65: the site's look is held in tokens, not typed again in each file. No raw `font-size: Npx` or `text-[Npx]`, and no
Tailwind size outside the three (title, body, small). Static: no browser, no database (the browser half is u90)."""

import re
from pathlib import Path

WEB = Path(__file__).resolve().parents[3] / "apps" / "web"
RAW = re.compile(
    r"font-size:\s*\d|text-\[\d|fontSize=\{\d|text-\[length:var\(--text-[a-z0-9-]+,|\btext-(xs|sm|base|lg|xl|[2-9]xl)\b|\bfont-(medium|bold|extrabold|black|thin|light)\b"
)
# SVG text drawn in the picture's own units, not the page's
EXEMPT = {"app/(app)/timetable/time-view.css"}


def test_no_raw_size_or_weight_outside_the_tokens():
    bad = []
    for p in [*WEB.glob("app/**/*.*"), *WEB.glob("components/**/*.*"), *WEB.glob("lib/**/*.*")]:
        rel = p.relative_to(WEB).as_posix()
        if p.suffix not in {".tsx", ".ts", ".css"} or rel in EXEMPT:
            continue
        for n, line in enumerate(p.read_text().splitlines(), 1):
            if RAW.search(line):
                bad.append(f"{rel}:{n}")
    assert not bad, "sizes belong to the tokens (docs/frontend/tokens.json): " + ", ".join(bad[:20])
