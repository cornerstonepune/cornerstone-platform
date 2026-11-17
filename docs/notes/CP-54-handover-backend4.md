# CP-54 handover: backend session 4 (17 Nov 2026)

Read first: docs/notes/standing-orders.md, CLAUDE.md, CP-54-handover-backend3.md (rules unchanged), this note.
Orchestrator: session_01KEBF26AbSER2xbWPJjbrmX. Nimish approved (17 Nov, in chat): placement on, held_lo, held_sl, held_cl,
the capability fill, merge #831 when green, all within the Rs 1,500 pre-approval, following the orchestrator's decisions.

## Done
- held_pl read (run 44059419156): gold 1.000, clean 0.435 (bar 0.80) -> BELOW, NOT switched on. Actual Rs 94.55.
  The clean faults on right picks were code (forced low on FMS/GMS/Maths/parts, "Science & Geo" counted exact, "a character").
- PR #831 (branch cp-54-cl-default) now also carries: SCI and GP default -> v2-reasoning.change-my-mind (tune 4/4, 3/3);
  headings ("/" and lists `heading_starts`); placement exactness + "character area"; skill-link one pick; assumption => low;
  code-given capability defaults off chain_disagreements. Body has the per-subject counts. 59 local tests pass.

## Next, in order
1. #831: wait for core CI green, then merge (Claude merges its own when green). Deploy; dispatch load_settings (no spend).
2. Rerun skill_held_pl (about Rs 95). Clean >= .80 and gold >= .85 -> active: true (small PR), then its chain.
3. skill_held_cl (<= Rs 200). If the map holds: chain_forecast, then capability_link (approved; about Rs 71 for the
   off-shortlist ones, fewer now that SCI and GP defaults are on the list). Report live counts.
4. v3 prompts, NOT started: LO validator (drop "one signal, the right one", fits-grade, siblings) and SL writer
   (doing not word; high only with an exact match). For each: version bump, engine eval, DECISIONS-LOG.md row, load_settings.
   Then held_lo (about Rs 266) and held_sl. Switch on at gold >= .85 and the clean bar; chains within Rs 1,500.
5. Open question for the orchestrator: storing "machine default" + low confidence on objective_statement needs a
   migration (no confidence column; a new `source` value trips the `source != 'machine'` person guard in apply_seed).
   Until then, coordinators can filter code defaults by subject from chain run output, not from the database.

Spend this session: Rs 0 (held_pl ran before it). CP-54 total about Rs 3,066 against the $150 cap.
