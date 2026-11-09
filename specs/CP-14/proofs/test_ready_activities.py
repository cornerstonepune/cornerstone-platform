"""CP-14 item 5: the child page lists the activities of the child's grade that are ready next, each with the ready
skills that make it so (design §3: `ready_activities: [{activity: {code, name}, because: [{code, name}]}]`, sorted by
activity code, on `k2_picture_reads.child_page` and `POST /k2/child`).

Rule: an activity is listed when at least one of its skills is ready and none of its skills is blocked (not done, with a
confirmed hard link before it that is not done). A skill with no confirmed link neither lists nor blocks; a done skill
neither helps nor blocks.

The table, worked by hand. The child (Sr. No. 1) is secure (done) on A and B, practising (not done) on X, unseen on the
rest. Links (after <- before):
    C <- A hard, confirmed      C ready (A done)
    D <- A hard, confirmed; D <- X hard, confirmed      D blocked (X not done)
    E <- B hard, confirmed      E ready
    F <- A hard, confirmed; F <- X soft, confirmed      F ready (a soft link not done blocks nothing)
    B <- A hard, confirmed      B done: neither
    G <- X hard, confirmed      G blocked
    H <- A hard, PROPOSED       H has no confirmed link: no claim either way
    U, V                         no link at all
Activities (K2 unless named):
    1 {C, U}   listed, because C          (one ready; an unlinked skill does not block)
    2 {E, D}   not listed                 (E ready, but D is blocked)
    3 {U, V}   not listed                 (only unlinked skills)
    4 {A, B}   not listed                 (all done)
    5 {E, C}   listed, because C and E
    6 {F, H}   listed, because F          (H's link is only proposed)
    7 {G}      not listed                 (blocked)
    8 {C}, band G1   not listed           (not the child's grade)
    9 {H}      not listed                 (a proposed link counts for nothing)
"""

from conftest import activity, child, link, page, person, school, state

TABLE = {1: "CU", 2: "ED", 3: "UV", 4: "AB", 5: "EC", 6: "FH", 7: "G", 9: "H"}
LISTED = {1: "C", 5: "CE", 6: "F"}


def scene(c):
    s = school(c)
    who, email = person(c, s, "class_teacher")
    for after, before, strength, status in (("C", "A", "hard", "confirmed"), ("D", "A", "hard", "confirmed"),
                                             ("D", "X", "hard", "confirmed"), ("E", "B", "hard", "confirmed"),
                                             ("F", "A", "hard", "confirmed"), ("F", "X", "soft", "confirmed"),
                                             ("B", "A", "hard", "confirmed"), ("G", "X", "hard", "confirmed"),
                                             ("H", "A", "hard", "proposed")):
        link(c, s, after, before, status, strength, by=who)
    acts = {n: activity(c, s, n, letters) for n, letters in TABLE.items()}
    acts[8] = activity(c, s, 8, "C", band="G1")
    kid = child(c, s, s["class"], "1")
    for letter, st in (("A", "secure"), ("B", "secure"), ("X", "practising")):
        state(c, s, kid, letter, st)
    return s, email, acts


def expected(s, acts):
    return [{"activity": {"code": acts[n], "name": f"Proof activity {n}"},
             "because": sorted(({"code": s["sk"][k], "name": f"Proof skill {k}"} for k in LISTED[n]),
                               key=lambda b: b["code"])}
            for n in sorted(LISTED, key=lambda n: acts[n])]


def _sorted_because(rows):
    return [{**r, "because": sorted(r["because"], key=lambda b: b["code"])} for r in rows]


def test_the_child_page_lists_exactly_the_hand_worked_ready_activities(conn):
    s, email, acts = scene(conn)
    got = page(conn, email, s["class"], "1")
    assert "ready_activities" in got, f"the child page has no ready_activities (keys: {sorted(got)})"
    assert _sorted_because(got["ready_activities"]) == expected(s, acts)
    assert [r["activity"]["code"] for r in got["ready_activities"]] == sorted(acts[n] for n in LISTED), \
        "sorted by activity code"
    # the per-skill answer the activities stand on, worked by hand from the same table
    assert [r["skill"]["code"] for r in got["ready_next"]] == [s["sk"][k] for k in "CEF"]


def test_post_k2_child_returns_ready_activities(conn, monkeypatch):
    """The route the site calls: its response model must carry the field, or the read's answer is cut off."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from engine.api.deps import get_conn
    from engine.api.routes import k2

    s, email, acts = scene(conn)
    conn.execute("update config set value = 'true'::jsonb where tenant_id = %s and key = 'voice.screens_enabled'",
                 (s["tenant"],))
    monkeypatch.setenv("ENGINE_KEY", "proof-key")
    app = FastAPI()
    app.include_router(k2.router)
    app.dependency_overrides[get_conn] = lambda: conn
    got = TestClient(app).post("/k2/child", headers={"X-Engine-Key": "proof-key"},
                               json={"actor": email, "class_id": s["class"], "roll_no": "1"})
    assert got.status_code == 200, got.text[:400]
    body = got.json()
    assert "ready_activities" in body, f"POST /k2/child has no ready_activities (keys: {sorted(body)})"
    assert _sorted_because(body["ready_activities"]) == expected(s, acts)
