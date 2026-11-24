# 0108 — K1 pilot: what already exists, what is missing, and the importer's shape

Date: 2026-11-24. Status: accepted (Plan). Tickets 1 and 2 written; 3 and 4 not yet.
Goal: none — proved by the goals of PROJECT.md M6 (K1 pilot), G6.1 to G6.5, each naming its test.

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

## Refined when the tickets were written (24 Nov, reading the sheet's merges)
- **Holidays come from the school's Pre-Primary calendar CSV** (`read_calendar_csv`, as K2), not from the week's Events cell. Reason: on
  Tue 24 Nov (Guru Nanak Jayanti) the period cells are *not* empty ("Academic 1 / General Awareness", "Block Room …"), and Events also holds
  non-holidays ("Memory Drawing", "No Screen Day"). The earlier rule "Events names a holiday and the cells are empty" would have made
  lessons on a holiday. The Events and Note rows are not loaded (nothing reads them yet).
- **Merged cells**: the sheet merges Wed 25 Nov 10:15–11:00 (PE over two rows) and the Meal row across the week. A CSV export loses that,
  so the capture fills every merged cell across what it covers (as `supabase/seed/k2_tabs_2026_11_04/` does). The reader still treats a
  fixed row with only Monday filled as the whole week's (a capture that forgot). A vertically merged lesson becomes two lessons with the same text.
- **Fortnight dates** come from the calendar; the week's own dates must agree (W1 Monday = fortnight start, W2 Monday = start + 7), else a
  conflict and nothing loads.
- **Parts**: a cell is cut at lines that are period names (`timetable.vocabulary` → `k1.part_heads`: Academic n, Extracurricular,
  Rhymes./Story. Pn, Music (Guest)). A part's subject is read from its head and the line after it only (the sheet's shape: name, subject,
  text), so "Block Room … art & forms" is not Art. `plan_key` = the subject's plan key (`plan_key_of_subject`, else the subject code), not
  the period name: the same keys K2 lines use. A part with nothing after its head makes no plan line.
- **Week B lines** take `week_code` B and number from 501, so loading W2 never collides with W1's lines under the unique
  (class, fortnight, plan_key, ord). shortcut: a week with over 500 lines under one key would collide; none is near 30.
- **Not planned yet** (ticket 2): a blank cell, or one whose every line is a period name, is a lesson with `planned = false`.
- Known gap, accepted: with no K1 frame rows, a K1 lesson's `session.kind` is `subject` or `fixed`, never `specialist` (PE, Music (Guest)).
