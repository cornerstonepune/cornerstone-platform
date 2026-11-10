"""CP-24 item 5 (LIVE, box only, read-only): the live watch agrees with the live ledger of the nightly rebuild.

In one read-only connection to the live database: is the newest ok nightly run (`flow_run`, flow `graph_nightly`; CP-27 group 6: once the ledger
`graph_run`) of the configured school older than
`graph.nightly_stale_hours` (or is there none)? `watch.problems` must carry a line about the nightly rebuild exactly
then. Prints yes or no and hours only, never a row, an id or a name.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "packages" / "engine"))

from engine.checks import watch  # noqa: E402
from engine.core import db  # noqa: E402

PLENTY = 50 * 10**9  # the disk is not this proof's question


def main() -> int:
    with db.connect() as conn:
        conn.read_only = True
        r = conn.execute(
            "select (select (value #>> '{}')::numeric from config c where c.tenant_id = t.id"
            "          and c.key = 'graph.nightly_stale_hours') as limit_h,"
            "       (select extract(epoch from now() - max(g.finished_at)) / 3600 from flow_run g"
            "          where g.tenant_id = t.id and g.flow = 'graph_nightly' and g.status = 'ok') as age_h"
            " from tenant t where t.slug = %s",
            (db.tenant_slug(),),
        ).fetchone()
        if r is None or r["limit_h"] is None:
            print("the school or its graph.nightly_stale_hours setting is not on the live database")
            return 1
        stale = r["age_h"] is None or float(r["age_h"]) > float(r["limit_h"])
        said = any("nightly" in ln.lower() for ln in watch.problems(conn, PLENTY))
        conn.rollback()
    age = "none" if r["age_h"] is None else f"{float(r['age_h']):.1f} h"
    print(f"newest ok nightly run: {age}; limit {float(r['limit_h']):g} h; stale: {stale}; the watch says so: {said}")
    return 0 if said == stale else 1


if __name__ == "__main__":
    sys.exit(main())
