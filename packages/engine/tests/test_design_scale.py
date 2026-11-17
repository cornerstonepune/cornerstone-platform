"""CP-65: the site's look is held in tokens, not typed again in each file. No raw `font-size: Npx` or `text-[Npx]`, and no
Tailwind size outside the three (title, body, small). Static: no browser, no database (the browser half is u90).

CP-68: the same for colour, corners, shadow and motion. A one-off is a colour, radius, shadow or transition time typed in a
file instead of read from a token, or one of the older pages' own classes and material colours (`panel`, `pill`,
`text-basalt/55`, `bg-neem/10` and the like) in place of a shared block. The offenders of 17 Nov 2026 are counted per file in
`docs/frontend/one-offs.json`; a file may hold no more than its count, a file not listed holds none, and a count that has
fallen must be lowered there, so the list only shrinks. `python packages/engine/tests/test_design_scale.py --write`
rewrites the list after a page is brought onto the blocks."""

import json
import re
import shutil
import subprocess
import sys
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
    assert not bad, "sizes belong to the design tokens (tokens.json), not to the file: " + ", ".join(bad[:20])


ONE_OFFS = WEB.parents[1] / "docs" / "frontend" / "one-offs.json"
# the generated tokens, the school's logo rules and the picture drawn in its own units are not pages
ONE_OFF_EXEMPT = EXEMPT | {"app/icon.svg"}
ONE_OFF = {
    "colour": re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z_-])|\brgba?\(|\bhsla?\("),
    "radius": re.compile(
        r"\brounded-(?:\[\d|(?:[trbl]{1,2}-)?(?:sm|md|lg|xl|2xl|3xl)\b)|border-radius:\s*[1-9]\d*(?!\d*%)"
    ),
    "shadow": re.compile(
        r"\bshadow-(?:\[(?!var\(|inset_0_0_0_\dpx_var\()|sm\b|md\b|lg\b|xl\b|2xl\b)|box-shadow:\s*(?!var\(|none|inset 0 [-\d]|0 0 0 \dpx var)\d"
    ),
    # a coloured stripe down or across one edge of a box (a subject, a state): the colour is the box's fill, its dot or its chip
    "stripe": re.compile(
        r"inset -?\dpx 0 0 var\(|inset 0 -?\dpx 0 var\(--(?!action)|\bborder-[ltrb]-4\b|border-(?:left|top): [2-9]px solid"
    ),
    "motion": re.compile(r"\bduration-\d+\b|\bduration-\[\d|transition[a-z-]*:[^;]*\b\d+m?s\b"),
}
# the older pages' own classes and material colours, in a component's markup (the style sheet that still defines them is not a use)
OLD = {
    "old class": re.compile(
        r"""className=(?:"|\{`)[^"`]*(?<![\w\-(\[])(?:panel(?:-head|-body)?|pill(?:-[a-z]+)?|chalkline|note)(?![\w\-)\]])"""
    ),
    "old colour": re.compile(
        r"\b(?:bg|text|border(?:-[trblxy])?|decoration|ring|outline|fill|stroke)-(?:basalt|chalk|lime|neem|bamboo|mud|monsoon|terracotta)\b"
    ),
}


def one_offs() -> dict[str, int]:
    """Each file of the site with a one-off in it, and how many lines of it hold one."""
    found: dict[str, int] = {}
    for p in sorted([*WEB.glob("app/**/*.*"), *WEB.glob("components/**/*.*"), *WEB.glob("lib/**/*.*")]):
        rel = p.relative_to(WEB).as_posix()
        if p.suffix not in {".tsx", ".ts", ".css"} or rel in ONE_OFF_EXEMPT:
            continue
        rules = [*ONE_OFF.values(), *(OLD.values() if p.suffix == ".tsx" else [])]
        # a comment is not a use: "issue #827" is not a colour
        lines = [
            ln for ln in p.read_text().splitlines() if not ln.lstrip().startswith(("//", "/*", "*", "{/*"))
        ]
        n = sum(1 for line in lines if any(rx.search(line) for rx in rules))
        if n:
            found[rel] = n
    return found


def test_no_new_one_off_colour_radius_shadow_motion_or_old_class():
    frozen: dict[str, int] = json.loads(ONE_OFFS.read_text())["files"]
    now = one_offs()
    grown = [f"{f}: {n} (frozen at {frozen.get(f, 0)})" for f, n in now.items() if n > frozen.get(f, 0)]
    assert not grown, (
        "a colour, corner, shadow or transition time belongs to the design tokens, and a box or a chip to the shared blocks "
        "(docs/ux-rules.md): " + "; ".join(grown[:20])
    )
    fallen = [f"{f}: {now.get(f, 0)} (frozen at {n})" for f, n in frozen.items() if now.get(f, 0) < n]
    assert not fallen, (
        "fewer one-offs than the list says: lower it, so it cannot come back "
        "(python packages/engine/tests/test_design_scale.py --write): " + "; ".join(fallen[:20])
    )


def test_the_shared_blocks_and_the_frame_hold_no_one_off():
    """The blocks, the frame and the three buttons are the language itself: every value in them is a token."""
    now = one_offs()
    shared = [
        "components/blocks.css",
        "components/app-frame.tsx",
        "components/ui/button.tsx",
        "components/cards.tsx",
    ]
    shared += [f for f in now if f.startswith("components/frame/")]
    shared += [
        "components/count-chip.tsx",
        "components/empty-state.tsx",
        "components/stat-tile.tsx",
        "components/subject-tag.tsx",
    ]
    assert {f: now[f] for f in shared if f in now} == {}


if __name__ == "__main__" and "--write" in sys.argv:
    found = one_offs()
    note = (
        "CP-68: the lines of each file of the site that type a colour, a corner, a shadow or a transition time of their own, "
        "or use an older page's class or material colour, instead of a token or a shared block. Held by "
        "packages/engine/tests/test_design_scale.py: no file may grow, no file may join, and a count that falls is lowered here."
    )
    ONE_OFFS.write_text(
        json.dumps({"note": note, "total": sum(found.values()), "files": found}, indent=2) + "\n"
    )
    print(f"{len(found)} files, {sum(found.values())} lines")


def test_every_colour_pair_meets_aa_and_the_contrast_table_is_current():
    """CP-68, done when 3: the pairs the tokens name are measured (WCAG 2, both themes) and the committed table is what they give."""
    node = shutil.which("node")
    assert node, "node is needed to measure the tokens (apps/web/scripts/contrast.mjs)"
    for script in ("tokens.mjs", "contrast.mjs"):
        ran = subprocess.run(
            [node, str(WEB / "scripts" / script), "--check"], capture_output=True, text=True, check=False
        )
        assert ran.returncode == 0, f"{script} --check: {ran.stderr.strip() or ran.stdout.strip()}"
