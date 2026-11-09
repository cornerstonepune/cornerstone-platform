# Stage 6: Comprehension Test (egm-comprehension, design.md only)

## What this proposes
CP-25 makes the full fortnight journey (draft timetable, put live, hand move, freeze, draft the week, approve a class,
align, approve the fortnight) work in one engine test. `public.fortnight_days` becomes the only rule for a fortnight's
dates and weeks A/B; CP-7's `internal.fortnight_slots` reads the layer when there is one, else the frame. Plus: "who may"
checks at the doors through `w2_print/who_may.py`; commands `move --to`, `approve-class` and route
`/fortnight/approve-class`; `config.seed_value`; a late voice clean-up watch line and a runbook; engine-logs counts only;
the logo on engine-rendered worksheets and packs.

## How the existing system works, per this document
The frame (`timetable_slot`, `fortnight_id` null) is never changed; go-live and the first hand move add a dated layer.
CP-7's reader sees both and breaks drafting and the approval gate. The date rule is written four times; CP-7's differs.
Group checks exist only for go-live and clash-accept. `fortnight_approve` is SQL-only. `load_config` overwrites every
non-`seed_once` row.

## Findings (as returned; resolution in consolidated_review_report.md)
1. 🟡 "the day page" used but never defined (fifth copy, or the screen the others match?).
2. 🟡 Is a layer always complete for every date of the fortnight? Layer-else-frame needs that fact.
3. 🟡 Cycle states and the two "approve"s (class vs fortnight) not explained; clash check not tied to its setting.
4. 🟡 "draft the week" vs the fortnight: `fortnight_plan`/`fortnight_plan_line` not defined; "week" means the fortnight.
5. 🟡 First deploy after the migration: are school-changed values lost once more? Say whether live data is at risk.
6. 🟡 Item 7 file list (render.py, page_css.py) disagrees with the renderers named in the Technical Plan.
7. 🟡 "the reader" (scanner) assumed, never introduced.
8. 🟡 Process terms (locked proof, proof-writer, LIVE proof, athena done) undefined.
9. 🟡 "keyed route" and "door" undefined; test_layout.py / workflows.json not explained.
10. 🟢 `current_staff()` vs `internal.resolve_staff()`; `fortnight_signature_of_slots` vs `fortnight_signature`.
11. 🟢 CUJ 2 refuses a draft "by route" but the table says drafting has no route.
12. 🟢 Undefined terms: seed_once, FET, Tier 3, lean first, rule 3, Done-when, the box, voice clean-up, nightly rebuild,
    engine-key credential, lockup-colour SVG, brand pack, READ-ME, five scopes, CP-6.
13. 🟢 Signature ordering: does the formatted line distinguish two same week/weekday/period lines?
14. 🟢 How the item 6 proof detects raw log lines.
15. 🟢 "the grant current on the school's day" means valid on today's date in the school's time zone.
