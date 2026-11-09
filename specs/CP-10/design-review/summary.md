# CP-10 design review (9 Nov 2026)

Four fresh reviewers (zoom-out, design, implementation-readiness, codebase-details). All findings folded into `design.md`.

| Finding | Source | Resolution |
|---|---|---|
| The child page shows the free sentence from the transcript; deleting it removes school-visible content | codebase-details | Keep the confirmed sentence (decision 3); asked of Nimish (A) |
| `note_claim` guard is statement-level; cannot allow a partial change | design, codebase-details | Stop writing `words`; no new trigger (decision 2) |
| New run table duplicates `flow_run` | zoom-out | Use `flow_run` (decision 5) |
| Missing file read as "deleted" if `data/` is unmounted | design | Run fails when the folder is unreadable (decision 5) |
| No done-marker; every run re-checks every old note | design | `audio_deleted_at` and `transcript_cleared_at` (decision 4) |
| Two cut-off keys can drift | design | One key (decision 1) |
| Hourly idempotency key blocks a retry | implementation-readiness | Failed run not stored as a replay; proved (decision 5) |
| `engine register` does not exist | implementation-readiness | `engine read voice status` (decision 7) |
| Live check proved only that a job ran | design | Asserts zero old raw copies (decision 6) |
| Sarvam setting needs a new command module | zoom-out | Added to `voice_switch` (decision 7) |
| Cron lines, map and tests the change breaks | codebase-details, implementation-readiness | Listed (decisions 6, 11) |
| Backups may keep copies past 48 hours | design, codebase-details | Named as a risk for a person to check |
