# wireframe-kit

## Verified

- Scope cut on 9 Nov 2026 (Nimish, via the frontend orchestrator): the real blocks are built in the app first, and
  wireframes are assembled from them. This branch now carries only `docs/frontend/DESIGN.md`,
  `docs/frontend/wireframes/DATA-GAPS.md` and `docs/frontend/wireframes/fake-names.json`. The generated kit, the
  checker and the pilot are in this branch's history (commit "Wireframe kit: design language, blocks, data binding,
  checker").
- DATA-GAPS.md: 25 gaps on 16 screens. Each screens.json `data` name was compared with specs/CP-27/target-tables.md
  after replaying supabase/migrations in order. The replay gave 170 tables, the count CP-27 cites.

## Handoff

- Live: nothing; docs only.
- Next: UI-14, UI-13 and UI-2 build the tokens, the frame and the blocks. Wireframes then follow DESIGN.md §7.
- For the backend: DATA-GAPS.md.
- Open: `picture.done_when` (10 / 8 columns) disagrees with SPEC §2 rule 10 and §5 (8 / 3) and with `picture.phone` (6).
