"""CP-18 item 1 (the repository part; the live part is live_prompt.py, box only).

The note-reading prompt is scored on real marked notes: at least as many marked lines as `eval.materials_read.lines`
asks for (60 by default), at least one note photographed (a case naming a photo or image file key; the photo itself is
never in git). Its result against each bar is in DECISIONS-LOG.md, and the version seeded active is the one that line
scored, with every bar met. Reads the committed files only: no model, no database."""

import decisions as d


def test_the_lines_bar_is_a_settings_row():
    assert "eval.materials_read.lines" in d.thresholds(), "no threshold row eval.materials_read.lines"


def test_the_gold_set_has_enough_real_marked_lines_and_a_photographed_note():
    cases = d.gold_cases()
    bar = d.thresholds().get("eval.materials_read.lines", 60)
    lines = sum(len(c.get("expect") or []) for c in cases)
    assert lines >= bar, f"{lines} marked lines in the gold set; the bar asks for {bar:g}"
    photos = [c for c in cases if any(("photo" in k or "image" in k) and v for k, v in c.items())]
    assert photos, "no case in the gold set is a photographed note"


def test_the_decisions_log_scores_it_against_every_bar_and_the_active_version_met_them():
    line = d.score_line()
    assert line, "DECISIONS-LOG.md has no line scoring materials_read (vN ... lines ...)"
    version = d.logged_version(line)
    bars = d.thresholds()
    for name, (key, way) in d.BARS.items():
        got = d.measure(line, name)
        assert got is not None, f"the log line gives no result for {name}"
        assert key in bars, f"no threshold row {key}"
        ok = got <= bars[key] if way == "at_most" else got >= bars[key]
        assert ok, f"{name} {got:g} misses its bar {key} {bars[key]:g}"
    assert d.seeded_active_versions() == [version], (
        f"seeded active materials_read versions {d.seeded_active_versions()}; the scored version is v{version}")
