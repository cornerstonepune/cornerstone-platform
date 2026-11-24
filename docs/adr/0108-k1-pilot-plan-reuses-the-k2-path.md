# 0108 — K1 pilot: what already exists, what is missing, and the importer's shape

Date: 2026-11-24. Status: proposed (Plan). Survey only: no tickets, no PROJECT.md change yet.
Goal: none — this records the survey and the importer's shape; the K1 milestone and its goals are added to PROJECT.md next session.

## What already exists (checked in code and, read-only, on live)
- **Rubric entry is already on the approved period page.** `docs/frontend/wireframes/period.html` (S3, approved) draws "Mark the class":
  child cards marked against the activity's four levels (`activity.level_0..3`), Absent, Not willing, plus Record / Type the marks / Add a photo.
  The built page is `apps/web/app/(app)/period/[id]/` (`child-levels.tsx`, `record.tsx`). So **no new wireframe is needed**. The
  `rubric` table (migration 20261211090000) is for English open answers, not this.
- Marks → `activity_observation` (route form or voice) → `evidence_event` (migration 20261227090000, config `voice.outcome_moves_level`,
  `voice.level_mark`). Voice notes: `pii.educator_note`, `engine/w3_read/voice_*.py`, `adapters/speech.py`. Nothing K2-only found in that path yet (unverified for every file).
- Live: grade `K1` exists; fortnights 10 (23 Nov–6 Dec) and 11 (7–20 Dec) exist with the K1 sheet's dates; 634 `activity` rows with band K1.
- Importer to reuse: `engine timetable load` (`w2_print/cli_timetable.py`) builds a `k2_timetable_load.Load` and writes it with
  `k2_timetable_sql.tables()` / `_run()` / `sql_file()` (all `on conflict do nothing`, frozen-fortnight gate, `--sql` for live).
  K1's sheet is a different shape (dated week blocks, 11 rows × 5 days), so K1 needs a **reader only**: `read_k1_week_csv(text, vocab) -> Load`
  and a `load-k1` command reusing the writer. Subject words come from `timetable.vocabulary.subject_phrases` (already has math, english,
  phonics, hindi, general awareness, pe, music, clay, art, story, rhymes, memory drawing, practical life, fine motor, routine).
- Class + children: `engine enrol k2` (`core/cli_people.py`) calls `people.enrol_k2(conn, "k2", …)` with the grade hard-coded; the function
  already takes a grade. `school.campus_grades` puts K1 at Neev.

## Missing (bad news first)
1. **There is no K1 class on live** (only K2 A, 22 children). Radhika cannot mark anything until the class, its children and her grant exist.
   Fix: let the enrol command take `--grade` (tiny ticket), then Nimish runs it with Radhika's Children List (kept outside git).
2. **K1 activities have no rubric words**: 0 of 634 have `level_0`, 33 have `level_3`. The page shows "Not written" for an empty level
   (it never invents one), so marking works by number only. Who writes the K1 level words is a product question for Nimish.
3. **Campus conflict**: the sheet's block is titled "Gurukul - K1 Time Table F.N 10 Week 1", but `school.campus_grades` (ASSUMED, #891) puts K1 at Neev.
   Holidays are per campus (`school_day`), so this must be confirmed before the first `--apply`.
4. A lesson needs an activity to be marked; K1 cell text will rarely match an activity name exactly, so the coordinator chooses one
   (existing ChooseActivity on S3).

## Decisions for the importer (taken here)
- Rows: each week block = title row (`F.N <n> Week <w>`), Word/Good deed/Prayer/Theme/Routines, `Date` (dd.mm.yy), `Day`, `Events/holidays`,
  11 time rows, Note to parents, Note to educators. K1 gets its own 11 `period` rows (grade_code K1); fixed rows are those in `vocab.fixed_rows`
  plus "meal" (needs adding to the vocabulary row, a config/seed change) — check against the sheet.
- A fixed row with only its first day filled (e.g. "Meal + Washroom") is a merged row: the text applies to every day.
- A day whose Events cell names a holiday and whose period cells are empty is a `school_day` holiday (24 Nov Guru Nanak Jayanti); no sessions.
- Text is copied verbatim, never written. An empty cell → a session with `planned = false`, text '' ("not planned yet"); this needs
  `Session.planned` in `Load` and the writer to stop hard-coding `true` (`k2_timetable_sql.py` session insert).
- **Two-part cells** (Wed 25 Nov 12:15 "Extracurricular / Music & Dance / Academic 2 / Math …"; Thu 26 Nov 12:15 "Music (Guest) / Rhymes. P2 …"):
  two readings. (A) two lessons at one time — `session` is unique per class, day and period, so this needs a schema change that ripples through
  every timetable reader. (B) one lesson at the cell's time holding the whole cell text, the cell split at each line that is a period name
  ("Academic 1/2", "Extracurricular", "Rhymes. Pn", "Story. Pn", "Circle Time") into `plan_entry` lines (plan_key = that name, in sheet order);
  a single-part cell's session links its one line, a two-part cell's links none and the coordinator chooses the activity. **Chosen: B** — no
  schema change, nothing invented, nothing lost. Nimish may overrule.
- Ticket order: (1) K1 reader + `load-k1` command (dry run, `--sql`), F.N 10 W1 first; (2) `Session.planned` in the writer; (3) enrol `--grade`;
  (4) a K1 end-to-end check: a form mark on a K1 session yields `activity_observation` + `evidence_event` (proves the W3 path is grade-free).
  No frontend ticket: S3 already covers it.
