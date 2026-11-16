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

from engine.core import db
from engine.w1_bank import apply_seed, seed_rows
from engine.w1_bank.k2_upload import curriculum_app

OUT = db.REPO_ROOT / "data" / "curriculum"


def _tenant(conn: db.Conn) -> db.Id:
    return db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]


def run_apply(write: bool) -> apply_seed.Report:
    """Used by `engine load --settings` too: apply (or only check) the files, commit, and write the rejects' file."""
    with db.connect() as conn:
        rep, _ = apply_seed.apply(conn, _tenant(conn), write)
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
        rep = run_apply(True)
        typer.echo(
            f"  curriculum seed: {rep.counts() or 'nothing new'}, {len(rep.rejected)} rejected, skipped {rep.skipped}"
        )
    except Exception as e:  # noqa: BLE001 — a deploy goes on; the failure is printed where the deploy log shows it
        typer.echo(f"  curriculum seed FAILED, nothing applied: {e}", err=True)


@curriculum_app.command("apply-seed")
def apply_seed_(
    write: bool = typer.Option(False, "--apply", help="write; without it, check and count only"),
) -> None:
    """Check every curriculum data file by code and apply what passes, as the machine's (never over a person's)."""
    rep = run_apply(write)
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
