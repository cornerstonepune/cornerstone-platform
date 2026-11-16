"""`engine curriculum apply-seed | revert-seed | review-sample | review-record` (CP-54): the curriculum data files of
`supabase/seed/curriculum/`, checked by code and applied as the machine's work (`apply_seed`, `seed_rows`).

`apply-seed` is a dry run unless `--apply`; every deploy runs it as part of `engine load --settings` (cli.py), so the files
of the commit deployed are live with it. Rejected rows are listed in `data/curriculum/rejected.json` with why: never
applied, never lost. `review-sample` picks the rows a second reader checks (about 5% a band, low confidence first)."""

import hashlib
import json
import re
from pathlib import Path

import typer

from engine.core import db, settings
from engine.w1_bank import apply_seed, seed_rows
from engine.w1_bank.k2_upload import curriculum_app

OUT = db.REPO_ROOT / "data" / "curriculum"


def _tenant(conn: db.Conn) -> db.Id:
    return db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]


def run_apply(write: bool, part: str = "all") -> apply_seed.Report:
    """Used by `engine load --settings` too: apply (or only check) the files, commit, and write the rejects' file."""
    with db.connect() as conn:
        rep, _ = apply_seed.apply(conn, _tenant(conn), write, part=part)
        conn.commit()
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "rejected.json").write_text(json.dumps(rejected_report(rep), indent=1, ensure_ascii=False))
    return rep


def band_of(row: dict) -> str:
    """The band a row belongs to: its grade, its band, or the one its objective's code names."""
    got = (
        row.get("grade")
        or row.get("band")
        or re.sub(r"^LO-([A-Z0-9]+)-.*$", r"\1", str(row.get("lo_code", "")))
    )
    return got if got and got != str(row.get("lo_code", "")) else "?"


def rejected_report(rep: apply_seed.Report) -> dict:
    """What the files' rows came to, for the people who make them: counts of refusals per band and rule, the refusals one by
    one with why, and the warnings. A refusal's rule is the letter its message starts with (`rule c:`), 0 for the basic ones."""
    counts: dict[str, dict[str, int]] = {}
    for _, row, why in rep.rejected:
        for w in why:
            rule = re.sub(r"^rule (\w):.*$", r"\1", w) if w.startswith("rule ") else "other"
            counts.setdefault(band_of(row), {})
            counts[band_of(row)][rule] = counts[band_of(row)].get(rule, 0) + 1
    warned: dict[str, int] = {}
    for _, row, _w in rep.warnings:
        warned[band_of(row)] = warned.get(band_of(row), 0) + 1
    return {
        "counts_by_band_and_rule": counts,
        "warnings_by_band": warned,
        "rejected": [{"file": f, "row": r, "why": w} for f, r, w in rep.rejected],
        "warnings": [{"file": f, "row": r, "why": w} for f, r, w in rep.warnings],
    }


def apply_on_load() -> None:
    """`engine load --settings`: the files of the commit deployed are applied. A file that fails is said loudly and does
    not stop the deploy; its rows are listed in data/curriculum/rejected.json."""
    try:
        with db.connect() as conn:
            parts = settings.config(
                conn, "curriculum.seed_parts", ["objectives", "activities"]
            )  # a row: held halves wait
        for part in parts:  # each half is a run of its own, so `revert-seed` can put back one
            rep = run_apply(True, part)
            typer.echo(
                f"  curriculum seed ({part}): {rep.counts() or 'nothing new'}, {len(rep.rejected)} rejected,"
                f" skipped {rep.skipped}"
            )
    except Exception as e:  # noqa: BLE001 — a deploy goes on; the failure is printed where the deploy log shows it
        typer.echo(f"  curriculum seed FAILED, nothing applied: {e}", err=True)


@curriculum_app.command("apply-seed")
def apply_seed_(
    write: bool = typer.Option(False, "--apply", help="write; without it, check and count only"),
    objectives_only: bool = typer.Option(
        False, "--objectives-only", help="only the objectives' half, as one run"
    ),
    activities_only: bool = typer.Option(
        False, "--activities-only", help="only the activities' half, as one run"
    ),
) -> None:
    """Check every curriculum data file by code and apply what passes, as the machine's (never over a person's)."""
    if objectives_only and activities_only:
        raise typer.BadParameter("one half at a time: --objectives-only or --activities-only")
    rep = run_apply(write, "objectives" if objectives_only else "activities" if activities_only else "all")
    typer.echo(f"  {'applied' if write else 'would apply'}: {rep.counts() or 'nothing'}")
    typer.echo(f"  skipped: {rep.skipped or 'nothing'}")
    typer.echo(f"  rejected: {len(rep.rejected)} (why, row by row: {OUT / 'rejected.json'})")
    for f, row, why in rep.rejected[:5]:
        typer.echo(
            f"    {f} {row.get('lo_code') or row.get('code') or row.get('ref') or row.get('skill_code')}: {'; '.join(why)}"
        )


@curriculum_app.command("revert-seed")
def revert_seed(run: str = typer.Argument(..., help="a run of apply-seed (flow_run id)")) -> None:
    """Put back what one run of apply-seed replaced, for each row nobody has changed since."""
    import uuid

    with db.connect() as conn:
        n = apply_seed.revert(conn, _tenant(conn), uuid.UUID(run))
        conn.commit()
    typer.echo(f"  put back: {n}")


def sample(rows: list[dict], per: float, low: float) -> list[dict]:
    """About `per` of the rows, chosen by a fixed hash so every run picks the same ones; those with `confidence` low are
    taken `low` times as often. A row's chance is its share of the hash space, nothing random."""
    out = []
    for r in rows:
        weight = per * (low if r.get("confidence") == "low" else 1)
        h = int(hashlib.sha256(r["lo_code"].encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
        if h < min(weight, 1.0):
            out.append(r)
    return out


@curriculum_app.command("review-sample")
def review_sample(
    per: float = typer.Option(
        0.05, "--share", help="the share of each band's rewrites a second reader checks"
    ),
    low: float = typer.Option(
        4.0, "--low-times", help="how many times as often a low-confidence row is taken"
    ),
    out: Path = typer.Option(OUT / "review_sample.json", "--out"),
) -> None:
    """Pick the rewrites a second reader checks: a fixed 5% a band, four times as many of the low-confidence ones."""
    picked: dict[str, list[dict]] = {}
    for path in seed_rows.files("lo_rewrites"):
        data = seed_rows.read(path)
        rows = [r for r in data.get("rows", []) if r.get("action") == "rewrite"]
        picked[data.get("band", path.stem)] = sample(rows, per, low)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(picked, indent=1, ensure_ascii=False))
    for band, rows in sorted(picked.items()):
        typer.echo(
            f"  {band}: {len(rows)} rows ({sum(r.get('confidence') == 'low' for r in rows)} low confidence)"
        )
    typer.echo(f"  written: {out}")


@curriculum_app.command("review-record")
def review_record(
    file: Path = typer.Argument(
        ..., help="a reviewer's verdicts: {rows: [{kind, band, key, verdict, correction, why}]}"
    ),
) -> None:
    """Keep a second reader's verdicts beside the data (supabase/seed/curriculum/review/<bands>.json). A row's `verdict` is ok,
    fix (with a `correction`) or wrong; `kind` is lo, activity or new_lo, `key` the code or ref. Nothing is applied from
    this: a person or the next pass reads it, and the checks still run on whatever replaces a row."""
    got = json.loads(file.read_text())
    bad = [r for r in got.get("rows", []) if r.get("verdict") not in ("ok", "fix", "wrong") or r.get("kind") not in ("lo", "activity", "new_lo")
           or (r.get("verdict") == "fix" and not r.get("correction"))]  # fmt: skip
    if bad:
        raise typer.BadParameter(
            f"{len(bad)} verdicts are not ok, fix (with a correction) or wrong, of a kind lo, activity or new_lo: {bad[:2]}"
        )
    bands = "-".join(sorted({r["band"] for r in got["rows"]}))
    target = seed_rows.ROOT / "review" / f"{bands}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(got, indent=1, ensure_ascii=False) + "\n")
    shares = {k: sum(r["verdict"] == k for r in got["rows"]) for k in ("ok", "fix", "wrong")}
    typer.echo(f"  {len(got['rows'])} verdicts {shares} kept in {target}")


def snippet(row: dict, why: str) -> str:
    """The text of the row a refusal is about, short enough to find it by: the level, the look-for, the wording, the source."""
    m = re.search(r"level (\d)", why)
    if m and row.get("levels"):
        return str(row["levels"].get(m.group(1), ""))[:140]
    if "look-for" in why or "look_fors" in why:
        return " | ".join(row.get("look_fors") or [])[:160]
    if why.startswith("rule c"):
        return f"{len(row.get('steps') or [])} steps: " + " / ".join(row.get("steps") or [])[:100]
    if "rule f" in why or "cites its sheet" in why:
        return json.dumps(row.get("source"), ensure_ascii=False)[:140]
    if "cites " in why:
        return " | ".join(row.get("sources") or [])[:140]
    word = re.search(r"uses '([^']+)'", why)
    if word:
        blob = " ".join([*(row.get("steps") or []), *(str(v) for v in (row.get("levels") or {}).values())])
        at = blob.lower().find(word.group(1).lower())
        return blob[max(at - 40, 0) : at + 60] if at >= 0 else ""
    return str(row.get("new_title") or row.get("title") or row.get("name") or row.get("subject_given") or "")[
        :140
    ]


def fix_lists(rep: apply_seed.Report) -> dict[str, str]:
    """{band: a Markdown fix list}: a line for each refusal and warning, with the file, the row, the rule, why, and the text."""
    lines: dict[str, set[str]] = {}
    for (
        _,
        r,
        w,
    ) in (
        rep.rejected
    ):  # a band whose only refusals are a subject the school does not have yet still gets its list
        if any("not a subject of the school" in x for x in w):
            lines.setdefault(band_of(r), set())
    for kind, items in (("refused", rep.rejected), ("warning", [(f, r, [w]) for f, r, w in rep.warnings])):
        for f, row, whys in items:
            for why in whys:
                if "not a subject of the school" in why:
                    continue  # not the worker's to fix: the subject list is the school's (reported apart)
                key = row.get("lo_code") or row.get("ref") or row.get("skill_code") or "?"
                rule = re.sub(r"^rule (\w):.*$", r"\1", why) if why.startswith("rule ") else "-"
                lines.setdefault(band_of(row), set()).add(
                    f"- {kind} `{f}` `{key}` rule {rule}: {why.removeprefix('rule ' + rule + ': ')} «{snippet(row, why)}»"
                )
    return {b: "\n".join(sorted(v)) + "\n" for b, v in lines.items()}


@curriculum_app.command("fix-list")
def fix_list(
    root: Path = typer.Option(
        None,
        "--seed-root",
        help="check these files instead of the repository's (a worker's branch checked out)",
    ),
    out: Path = typer.Option(
        OUT, "--out", help="where CP-54-fixlist-<band>.md go (beside the rejects' file by default)"
    ),
) -> None:
    """Check the curriculum data files (dry: nothing is applied) and write, for each band, the list of rows a worker must fix."""
    if root:
        seed_rows.ROOT = root
    rep = run_apply(False)
    got = fix_lists(rep)
    out.mkdir(parents=True, exist_ok=True)
    for band, text in sorted(got.items()):
        head = f"# CP-54 fix list, {band}\n\nRows `engine curriculum apply-seed` refused or warned about. Fix each, push; it is checked again.\n\n"
        (out / f"CP-54-fixlist-{band}.md").write_text(head + text)
        typer.echo(f"  {band}: {text.count(chr(10))} lines")
    typer.echo(f"  by band and rule: {json.dumps(rejected_report(rep)['counts_by_band_and_rule'])}")
