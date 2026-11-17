# CP-54 objective-code ledger (17 Nov)

Machine-made objective codes (`LO-<band>-N###`) were positional: a ref's code was its place in the seed files. Every deploy ran
subject_map.apply (code from a stale label) then apply-seed (code back from the files), so 103 titles changed per deploy.
- `supabase/seed/curriculum/new_lo_codes.json`: {codes: {band: {ref: code}}, highest: {band: n}}; built from today's mapping
  (446 refs, verified against live titles). `highest` counts orphans so a number is never reused.
- `new_los` reads codes from it; a ref with no code is refused, naming the file and the next free number.
- `_new_lo` sets `subject` from the code's subject on insert and on update (116 stale labels fixed at the next load).
- apply-seed retires machine-made N-rows no ref names and no activity uses (39: K2 34, G4 3, G2 1, G3 1) as `lo_retired` changes
  marked `orphan`, so they appear in the flow_run and on the coordinators' check-first list; revert puts them back.
- Same two patterns searched elsewhere: see the PR body.
