# Reconciliation checklist

Run this per batch. A task with any box unticked is reported as partly checked, never as done.

- [ ] Done-when text copied verbatim, split into numbered clauses.
- [ ] Every clause has one verdict: MET, PARTLY, NOT MET, or CANNOT VERIFY HERE.
- [ ] Every MET cites file:line, a migration name, a commit sha with PR number, or a recorded measured value with its location.
- [ ] Commits matched by content (diff stat and touched files), not by the ID in the title.
- [ ] Any threshold changed after its measurement is judged against the original wording, and the change is named.
- [ ] Clauses that need real use have a live read-only query result, or are CANNOT VERIFY HERE.
- [ ] Work built that the done-when did not ask for is listed.
- [ ] Every NOT MET or PARTLY clause has a goalpost: an observable outcome and the command or query that checks it.
- [ ] Unreached items (e.g. a run stopped by a cost cap) are counted and named, not extrapolated.
