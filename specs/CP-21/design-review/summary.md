# CP-21 design review (light: 3 fresh reviewers)

Reviewers: egm-zoom-out, egm-design, egm-codebase-details. All three asked for changes; every blocker and major was applied
in design.md.

| Finding (reviewer) | Applied |
|---|---|
| Splitting the frame breaks FN10 itself, the next fortnight, and pins on the rules screen (all three) | Frame never touched: a live fortnight is a layer of dated rows (`fortnight_id` set); `k2_day.py` prefers it |
| Reader list wrong: two named files read `staff_role_grant` (zoom-out, codebase) | Corrected: `k2_day.py`, `educator_gate.py`, `tt_rules.py`/CP-11 |
| Freeze bypassed by an automatic reason (design, zoom-out) | Step checks CP-6 state and `--reason` itself; never sets a reason |
| Deferrable session key breaks the loader's bare `on conflict` (all three) | Loader insert rewritten `where not exists`, tested; risk named |
| `materials_line_session` does not exist (design, codebase) | `materials_line_source`; dates move with the session or the step stops |
| Fixed/specialist sessions would move or be deleted (codebase) | Only sessions on subject cells take part |
| Non-planned sessions, `planned` ambiguity (design, codebase) | `state = 'planned'` and `planned = true` named; others stop the step |
| Plan-line order and week A/B (design, codebase) | Matched by plan `ord` within the same week |
| New sessions and their text are beyond the scope (zoom-out, codebase) | No new sessions; the day page shows the grid row's text |
| Hash cannot count changes (design) | Snapshot jsonb, compared entry by entry |
| Lock per fortnight races on per-class rows (design) | Lock per (tenant, class), shared with CP-12 |
| Loader re-run puts sheet sessions back (design) | Loader refuses a live fortnight |
| Dates with no `school_day` row; FN10 has 14 loaded days (design, codebase) | Refused; named as a risk for FN10 |
| Stale-draft check after another fortnight goes live (design) | Frame untouched; tested |
| CLI `staff_of` raises an API error (codebase) | `cli_map.staff_of` |
| `--dry` needs write grants (design) | Works out changes without writing; box runs it read-only |
| Nits: time zone setting, decision 10 cut to out of scope, CP-12 text contradiction | Applied (CP-12 updated on its own branch) |
