# Stage 8: Intermediate Zoom Out (egm-zoom-out, on the revised design)

Verdict at the time: not ready to lock, only because of Open Question 1 (parent reports). Nothing material added beyond
the scope. Contested catalyst 4 (import cycle) confirmed in the code.

1. 🔴 Line 7 / Open Question 1. **Resolved**: option A decided 9 Nov; issue #530's line 7 and Out of scope edited before
   the lock; Goal 7 and Open Questions follow.
2. 🟡 Status line overstated; no consolidated resolution file. **Resolved**: status reworded; the resolution is at the
   end of `implementation_readiness_report.md`.
3. 🟡 Go-live and clash-accept checked twice, and "a door cannot get a staff id without as_actor" was false.
   **Resolved**: they keep their one check inside the library (through `who_may`); doors pass the id `as_actor` returned.
4. 🟡 `test_k2_timetable.py` calls `generate` without `week_of`. **Resolved**: listed as modified.
5-12. 🟢 **Resolved**: clean-up query restricted to ok; "everything" cited from the seed's descriptions; spec.md copied
   at lock; scanner tests named; "five scopes" named, Tier 3 explained; `check_approval` names its setting; journey test
   reuses the placed-run fixture; `fortnight_is_approver` generalised, not the out-of-scope simplification.
