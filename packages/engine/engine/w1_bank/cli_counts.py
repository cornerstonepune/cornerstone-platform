"""`engine curriculum counts` (CP-54): what is live, read from the database, for the people who ask "how much is in?".
Read-only: it writes nothing and calls no model. One plain line per figure, so a run's log is the answer.

Objectives per band in scope (live, reworded, retired, new, without a subject), activities per grade (with no objective yet, which
is what `needs_link` means), the profile's capability links, each apply-seed run, and the model spend per skill purpose
(calls, rupees, first and last call) so it can be set beside the API console."""

import typer

from engine.core import db, settings
from engine.w1_bank import chain_draft
from engine.w1_bank.k2_upload import curriculum_app


def gather(conn: db.Conn, t: db.Id) -> dict[str, list[dict]]:
    """The figures, as rows by section."""

    bands = (settings.config(conn, "curriculum.subjects") or {}).get(
        "bands", []
    )  # the grades in scope: a row

    def rows(sql: str, *args: object) -> list[dict]:
        return [dict(r) for r in conn.execute(sql, args).fetchall()]  # type: ignore[arg-type]

    def by_grade(found: list[dict]) -> list[dict]:  # the school's own order of grades, never the text order
        return sorted(found, key=lambda r: bands.index(r["band"]))

    return {
        "objectives": by_grade(
            rows(
                "select band, count(*) filter (where not retired) as live,"
                " count(*) filter (where not retired and source_text is not null and source_text <> title) as reworded,"
                " count(*) filter (where retired) as retired,"
                " count(*) filter (where code ~ '^LO-[A-Z0-9]+-N') as new,"
                " count(*) filter (where not retired and subject_code is null) as no_subject"
                " from learning_objective where tenant_id = %s and band = any(%s) group by band",
                t,
                bands,
            )
        ),
        "activities": by_grade(
            rows(
                "select a.band, count(*) as activities,"
                " count(*) filter (where not exists (select 1 from activity_objective x where x.tenant_id = a.tenant_id"
                " and x.activity_code = a.code)) as needs_link, count(*) filter (where a.subject_code is null) as no_subject"
                " from activity a where a.tenant_id = %s and a.band = any(%s) group by a.band",
                t,
                bands,
            )
        ),
        "capability_links": rows(
            "select count(*) as links, count(distinct o.lo_code) as objectives from objective_statement o"
            " join framework_statement g on g.tenant_id = o.tenant_id and g.framework_code = o.framework_code"
            " and g.code = o.statement_code and g.kind = 'group' where o.tenant_id = %s and o.framework_code = %s",
            t,
            chain_draft.PROFILE_CODE,
        ),
        "apply_seed_runs": rows(
            "select id::text as run, started_at::text as at, status, request->>'part' as part,"
            " request->'counts' as counts from flow_run where tenant_id = %s and flow = 'curriculum.apply-seed'"
            " order by started_at",
            t,
        ),
        "spend": rows(
            "select flow, count(*) as calls, round(sum(cost_inr)::numeric, 2) as cost_inr, min(started_at)::text as first,"
            " max(started_at)::text as last from flow_run where tenant_id = %s and flow like 'skill.%%' group by flow"
            " order by flow",
            t,
        ),
    }


@curriculum_app.command("counts")
def counts() -> None:
    """What is live: objectives and activities per band, capability links, apply-seed runs, skill spend. Read-only."""
    with db.connect() as conn:
        t = db.one(conn, "select id from tenant where slug = %s", (db.tenant_slug(),))["id"]
        got = gather(conn, t)
    for section, rows in got.items():
        typer.echo(f"-- {section}")
        for r in rows:
            typer.echo("  " + "  ".join(f"{k}={v}" for k, v in r.items()))
