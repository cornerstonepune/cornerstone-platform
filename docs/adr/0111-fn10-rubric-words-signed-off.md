# 0111 — F.N 10 rubric words signed off; two K2 rows shared with K1; six new K1 activities

Date: 2026-11-24. Status: accepted (Nimish, in chat, 24 Nov; written by Plan).
Goal: none — proved by PROJECT.md M6 G6.6 and its test `packages/engine/tests/test_fn10_words.py` (in the core; the engine core budget goes 230 → 231 for it).

## Decisions (Nimish, 24 Nov, in chat)
1. The F.N 10 rubric words in `docs/loop/notes/fn10-rubric-draft.md` are **signed off as drafted**: level_0..level_3 on
   ACT-K1-0973, 0974, 0975, 0716, 0630, 0631, 0632, 0633, 0665, 0782, 0783, 1202, 1134, 1146 and ACT-K2-M0018.
2. **Yes**: ACT-K2-M0018 (clay carrot, chillies, apple) and ACT-K2-0449 (Khari Kamai) are shared with K1:
   `also_bands` gets K1. Both stay K2 rows; K2 sees the clay words too. Khari Kamai keeps its own words.
3. The six F.N 10 lessons with no activity row **are activities, not learning objectives**. Each becomes a new K1
   activity, named as on the timetable:

| Code | Name | Strand | Subject |
|---|---|---|---|
| ACT-K1-F001 | The Sun And The Moon | Rhymes | ENG |
| ACT-K1-F002 | Introduction to number tracing 5 and 6 | Maths | NUM |
| ACT-K1-F003 | Trace and write R and D (combination lines) | English | ENG |
| ACT-K1-F004 | Name of farm animals | Hindi | HIN |
| ACT-K1-F005 | Swar ए | Hindi | HIN |
| ACT-K1-F006 | Memory Drawing | Art & Craft | ART |

## Awaiting Nimish's OK: the 24 words of the six new activities
A model drafted them in the draft's style (`docs/loop/notes/fn10-new-activity-words.md`). The rows go in now so the
lessons can be marked; Nimish may change any word later (in the file, or on the activity's page). Each row carries
`confidence: low` and a note saying so.

## How it reaches live (and an assumption, made unattended)
Nimish asked for the normal seed path, never a hand-written live write. Read on 24 Nov, the seed path can do only part:
- **New activities** do go through it: `supabase/seed/curriculum/activities/K1.json`, applied by `apply-seed` on every
  deploy (`engine load --settings`). The six rows have no objective (K1 has none on file), so `needs_link: true`.
- **Words on rows that exist, and `also_bands`**, have no seed loader. `registry.json` is generated and its load never
  overwrites an activity (M0-02); `apply-seed` only refreshes rows it made itself. So, as ADR 0052 did for skills, a
  numbered migration (`20270217090000_fn10_rubric_words.sql`) says it for the databases already loaded: release pushes
  it to live with `bin/push-migrations`. It fills a word only where the field is empty, so it never overwrites words a
  person wrote, and it adds K1 to `also_bands` only once. It is kept as Nimish's change in the history.
- Rejected: a new seed loader for "words on an existing activity". Right long term, but it is product code (a ticket,
  builder, review) and F.N 10 is running now. Reopen it if this happens for F.N 11.

## Consequences
- A database built fresh from the repo (CI, `bin/testdb fresh`) runs migrations before `engine load`, so the 15 rows'
  words are not there; the test runs the migration over the loaded test database itself.
- Live's ACT-K2-0449 words were read as complete on 24 Nov (the draft); this change does not touch them.
- If a person filled any of the 15 rows' words between the draft and release, their words stand and the drafted word
  for that field is not applied (the migration prints how many fields it filled).
