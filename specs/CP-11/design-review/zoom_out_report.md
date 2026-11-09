# CP-11 zoom-out review (goldfish: egm-zoom-out)

Verdict: generate, keep and report is sound; `apply` is the bulk of the risk.

1. 🔴 `apply` widens the scope beyond "one command": a second command, a reader rule in three files, overlay slots, re-placing sessions; it is the main reason CP-11 waits on CP-6. Fix: split it out, or decide it with Nimish.
2. 🔴 "Writes nothing" contradicts keeping an unmeetable run row. Fix: "writes nothing to the timetable or sessions; the run report is kept".
3. 🔴 A FET timeout is labelled "unmeetable". Fix: three outcomes (placed, unmeetable with a named rule, not found in time).
4. 🟡 "Latest valid_from wins" is fragile: a later pin or a reload overrides a generated cell, and nothing says which rows came from a run. Fix: tag rows with the run id.
5. 🟡 Holidays cancel or move, changed-timing days, once-a-day spread are school choices. Fix: list them with defaults.
6. 🟡 Proofs section is a stub; the box proof is not named. Fix: name about five proofs.
7. 🟢 `input_sha256` duplicates `input_text`. Cut it.
8. 🟢 "Nothing else calls a subprocess" is false (`checks/done.py`, `checks/live.py`). Fix the wording.
9. 🟢 Capacity arithmetic and the build-time FET check are too detailed for a design.

Not checked: CP-6's real names, FET's timeout behaviour, the live box.
