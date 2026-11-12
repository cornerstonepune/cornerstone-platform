# CP-47 — slow statements on every browser run
One-word change in .github/workflows/ci.yml (failure() to always()), so p6 slow and fast runs can be compared on database time. Frontend adds the page's navigation timing, nproc, CPU model and load to p6 itself.
