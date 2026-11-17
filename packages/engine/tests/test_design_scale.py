"""CP-65, CP-68b: the site's look is held in tokens and one card, not typed again in each file. Static: no browser, no database
(the browser half is apps/web/tests/u90-design-system.spec.ts).

- No raw `font-size: Npx` or `text-[Npx]`, and no Tailwind size outside the three (title, body, small).
- One box: a surface with an edge is `Card` (apps/web/components/cards.tsx), whose look is the `.card` rule in components/blocks.css.
  A file that draws its own (the card radius or the card shadow in CSS, a `rounded…` utility that is not a control's or a pill's) fails.
- No one-off spacing: no `[12px]` or `[3rem]` in a class, no inline style that only repeats what a class can say, no raw px in a CSS
  padding, margin or gap beyond what each file held on the day the rule was written (it only shrinks).

Every exception is written here, with its reason."""

import re
from pathlib import Path

WEB = Path(__file__).resolve().parents[3] / "apps" / "web"
RAW = re.compile(
    r"font-size:\s*\d|text-\[\d|fontSize=\{\d|text-\[length:var\(--text-[a-z0-9-]+,|\btext-(xs|sm|base|lg|xl|[2-9]xl)\b|\bfont-(medium|bold|extrabold|black|thin|light)\b"
)
# SVG text drawn in the picture's own units, not the page's
EXEMPT = {"app/(app)/timetable/time-view.css"}

# Files another piece of work owns while CP-68b is built; each leaves this list when that work lands, and the list only shrinks.
OWNED_ELSEWHERE = (
    "components/frame/",  # the bar and the sidebar: CP-68a
    "components/app-frame.tsx",  # the frame: CP-68a
    "components/status-chip.tsx",  # the chip: CP-68a
    "components/empty-state.tsx",  # the empty state: CP-68a
    "components/educator/to-confirm.tsx",  # a chip: CP-68a
    "app/(app)/setup/curriculum/",  # the curriculum page, being rebuilt: CP-67
)

# --- one box ---------------------------------------------------------------------------------------------------------------
CARD_CSS = "components/blocks.css"
# the only rounded corners a class may ask for outside the card: a control's, a pill's, a dot's
ROUNDED = re.compile(r"(?<![\w-])rounded(?:-[a-z0-9]+)*(?:-\[[^\]]*\])?")
ROUNDED_OK = {
    "rounded-full",
    "rounded-none",
    "rounded-[var(--radius-control)]",
    "rounded-[var(--radius-pill)]",
}
# The card's shadow or corner outside the card, each with its reason. A rule is named as (file, how its line starts, or the selector the
# line sits under). Buttons, chips and the empty state are CP-68a's and leave this list when it lands; the legend shows the tokens.
SHADOW_OK = {
    ("components/blocks.css", ".b-btn "),  # the button: CP-68a
    ("components/blocks.css", ".b-seg "),  # the selected tab of a segmented control: CP-68a
    ("components/blocks.css", ".b-legend "),  # the token legend draws the shadow it names
    ("app/globals.css", ".chip"),  # the older chip: CP-68a
    ("app/globals.css", ".btn.secondary"),  # the older button: CP-68a
}
TSX_SHADOW_OK = {"components/ui/tabs.tsx"}  # the selected tab of the tab list, a control
RADIUS_OK = {
    ("components/blocks.css", ".b-empty "),  # the empty state: CP-68a
    ("components/blocks.css", ".b-legend "),  # the token legend
}
# the older pages' box, retired for the card
OLD_BOX = re.compile(r"""className=[^>\n]*?["'`\s](panel(?:-head|-body)?)(?=["'`\s])""")

# --- no one-off spacing ----------------------------------------------------------------------------------------------------
ARBITRARY = re.compile(r"(?<![\w-])([a-z:\[\]0-9-]*?)-?\[-?[0-9.]+(?:px|rem)\]")
# a breakpoint is a width of the screen, not a space on it: `min-[701px]:`, `max-[700px]:`
BREAKPOINT = re.compile(r"(?:min|max)-\[\d+px\]:")
ANY_ARBITRARY = re.compile(r"\[-?[0-9.]+(?:px|rem)\]")
# an inline style whose every value is a fixed string says nothing a class cannot
STATIC_STYLE = re.compile(r"style=\{\{\s*(?:\"?[\w-]+\"?\s*:\s*\"[^\"]*\"\s*,?\s*)+\}\}")
# a style that carries data: a custom property the CSS reads, or a value worked out from the row (a width, a place, a transform)
CSS_SPACING = re.compile(r"(?:padding|margin|gap)[a-z-]*:[^;{}]*?(?<![\w.-])\d*\.?\d+px")
# raw px in a padding, margin or gap, per file, on 17 Nov 2026 after CP-68b (44 before it); a number here only goes down.
# globals.css: the bar's search, the older tag, chip and button (CP-68a's). blocks.css: the two buttons (CP-68a's) and the legend's swatch.
CSS_SPACING_HELD: dict[str, int] = {"app/globals.css": 4, "components/blocks.css": 3}


def _files(*suffixes: str):
    for p in sorted([*WEB.glob("app/**/*.*"), *WEB.glob("components/**/*.*"), *WEB.glob("lib/**/*.*")]):
        if p.suffix in suffixes:
            yield p.relative_to(WEB).as_posix(), p.read_text()


def _mine(rel: str) -> bool:
    return not rel.startswith(OWNED_ELSEWHERE)


def test_no_raw_size_or_weight_outside_the_tokens():
    bad = []
    for rel, text in _files(".tsx", ".ts", ".css"):
        if rel in EXEMPT:
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if RAW.search(line):
                bad.append(f"{rel}:{n}")
    assert not bad, "sizes belong to the design tokens (tokens.json), not to the file: " + ", ".join(bad[:20])


def _class_boxes() -> list[str]:
    bad = []
    for rel, text in _files(".tsx", ".ts"):
        if not _mine(rel):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            bad += [f"{rel}:{n} {m}" for m in ROUNDED.findall(line) if m not in ROUNDED_OK]
            bad += [f"{rel}:{n} .{m}" for m in OLD_BOX.findall(line)]
            if "shadow-[var(--shadow-card)]" in line and rel not in TSX_SHADOW_OK:
                bad.append(f"{rel}:{n} the card shadow in a class")
    return bad


def _held(rel: str, selector: str, ok: set[tuple[str, str]]) -> bool:
    return (rel == CARD_CSS and selector.startswith(".card")) or any(
        rel == f and selector.startswith(start) for f, start in ok
    )


def _css_boxes() -> list[str]:
    bad = []
    for rel, text in _files(".css"):
        selector = ""
        for n, line in enumerate(text.splitlines(), 1):
            rule = line.strip()
            # a rule on one line names itself; a rule over several lines is named by the line that opened it
            selector = rule if "{" in rule else selector
            if re.match(r"\.panel(-head|-body)?\b", rule):
                bad.append(f"{rel}:{n} the old .panel box")
            if "var(--radius-card)" in rule and not _held(rel, selector, RADIUS_OK):
                bad.append(f"{rel}:{n} the card radius outside .card")
            if "var(--shadow-card)" in rule and not _held(rel, selector, SHADOW_OK):
                bad.append(f"{rel}:{n} the card shadow outside .card")
    return bad


def hand_rolled_boxes() -> list[str]:
    return _class_boxes() + _css_boxes()


def test_one_box_the_card():
    bad = hand_rolled_boxes()
    assert not bad, f"{len(bad)} boxes drawn by hand; use Card (apps/web/components/cards.tsx): " + ", ".join(
        bad[:20]
    )


def arbitrary_values() -> list[str]:
    bad = []
    for rel, text in _files(".tsx", ".ts"):
        if not _mine(rel):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if ANY_ARBITRARY.search(BREAKPOINT.sub("", line)):
                bad.append(f"{rel}:{n}")
    return bad


def test_no_arbitrary_spacing_or_size_in_a_class():
    bad = arbitrary_values()
    assert not bad, (
        f"{len(bad)} one-off values; use the spacing scale (var(--space-N), var(--tap)) or a class: "
        + ", ".join(bad[:20])
    )


def static_inline_styles() -> list[str]:
    bad = []
    for rel, text in _files(".tsx"):
        if not _mine(rel):
            continue
        for m in STATIC_STYLE.finditer(text):
            # a custom property is how a block hands data to its CSS, even when the value is written out
            if '"--' not in m.group(0):
                bad.append(f"{rel}:{text.count(chr(10), 0, m.start()) + 1}")
    return bad


def test_no_inline_style_a_class_can_say():
    bad = static_inline_styles()
    assert not bad, "an inline style with only fixed values belongs in a class: " + ", ".join(bad)


def css_raw_spacing() -> dict[str, int]:
    return {
        rel: n for rel, text in _files(".css") if rel not in EXEMPT and (n := len(CSS_SPACING.findall(text)))
    }


def test_css_spacing_is_the_scale_and_only_shrinks():
    now = css_raw_spacing()
    over = {f: n for f, n in now.items() if n > CSS_SPACING_HELD.get(f, 0)}
    assert not over, (
        f"raw px in a padding, margin or gap (use var(--space-N)); held at {CSS_SPACING_HELD}, now {over}"
    )
    slack = {f: n for f, n in CSS_SPACING_HELD.items() if now.get(f, 0) < n}
    assert not slack, (
        f"lower CSS_SPACING_HELD to what the files now hold: { {f: now.get(f, 0) for f in slack} }"
    )


def test_the_card_rule_is_the_scale():
    """The card itself: its padding is space-3 (20 px), a row's space-2, its corner the card radius, its edge a hairline."""
    css = (WEB / CARD_CSS).read_text()
    card = re.search(r"^\s*\.card \{([^}]*)\}", css, re.M)
    assert card, "components/blocks.css has no .card rule"
    body = card.group(1)
    for want in (
        "padding: var(--space-3)",
        "border: 1px solid var(--line)",
        "border-radius: var(--radius-card)",
    ):
        assert want in body, f".card must say `{want}`"
    assert re.search(
        r"^\s*\.card\[data-compact\] \{[^}]*padding: var\(--space-2\) var\(--space-3\)", css, re.M
    ), "a row is the card, compact"
