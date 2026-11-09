# CP-1 fix: the seed's own writes are not "edited on the site"

**Found** by the CP-2 build session on a fresh database: CP-1's `activity_edit_kept` trigger keeps the first write of
an activity under `app.changed_by`, else the database login. The loader set neither, so every seeded activity field
(and every seeded link) was kept as `postgres`, and `k2_upload.snapshot()` read each as a person's edit. `plan()` then
refused to write the sheet's words over it, so `test_the_comparison_matches_an_activity_by_its_strand_and_name…`
failed (`objective` missing) on main, in CI engine shard 3. Reproduced with `bin/testdb fresh`: 15,688 rows, all
`postgres`. Live was not affected (0 of 4,232 rows are `postgres`).

**Fix** (no migration):
- `supabase/seed/k2_sheet.json` gets `seed_label: "seed load"`, beside `upload_label`: the label is a setting.
- `core/loaders._registry` sets `app.changed_by` to it, first thing, for the whole load. Everything the seed writes
  is kept, labelled as the seed. After the fix a fresh database holds 15,688 rows, all `seed load`.
- `k2_upload.snapshot()` treats a row as a person's edit only if its label is neither the upload's nor the seed's.

**Chosen over** making the trigger skip history for non-person inserts: that would undo CP-1's promise that the first
write of an activity is kept (done-when 5). The trigger is untouched; a person's first add is still kept under their
name and still reads as theirs (new test).

**Not done, on purpose:** a bare-login write by some future script still reads as a person's. The loader was the only
such writer found (`app.changed_by` is set by `k2_upload`, `map_ledger`, `retire`, and the site's own actions).
