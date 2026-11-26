# 0117 — A K1 lesson may be offered a group its head does not teach (`timetable.offers`)

Date: 2026-11-26. Status: accepted (Nimish's ask via the coordinator, 26 Nov; written by Plan, unattended).
Goal: none — proved by PROJECT.md M6 G6.8 and its test `packages/engine/tests/test_k1_offer_only.py` (ticket #955).

## Why
After ADR 0113, five signed-off K1 choices are still refused by `tt_heads.ensure_offered`, because a lesson is offered
only its head's groups, and a head's groups also say which subject it teaches (`subjects_of`, `heads_in`: offer
sequence, objectives, who may edit). ADR 0113's first version tried adding groups to heads and was rejected for that.

| Date | Lesson (subject code) | Activity | Its group |
|---|---|---|---|
| 30 Nov, 1 Dec | rhymes | ACT-K1-0665 French rhyme | Music |
| 30 Nov | clay | ACT-K1-F003 trace R and D | English |
| 1 Dec | other (no head; takes no activity) | ACT-K1-0783 Smelling bottles | Block Room |
| 2 Dec | music | ACT-K1-F002 number tracing 5 and 6 | Maths |

## Decision
1. A new setting `timetable.offers`, grade → lesson subject code → groups, seed_once:
   `{"K1": {"rhymes": ["Music"], "clay": ["English"], "other": ["Block Room"], "music": ["Maths"]}}`.
   Keyed by grade, so K2 and Grades 1 to 4 are offered exactly what they were. Keyed by the lesson's
   `subject_code`, not its head, so `other` needs no new head (a new head would show in the rules page, `k2_day` and
   the picker's head list).
2. `ensure_offered` and `offers` accept a head's groups plus these. `heads`, `head_of`, `groups_of`, `heads_in` and
   `subjects_of` never read it, so no head teaches a new subject and `timetable.heads` is unchanged.
3. It reaches live as ADR 0113's settings did: migration `20270221090000_k1_offer_only.sql` adds the row when missing;
   `config.json` says the same for a new database.

## Assumptions (unattended; for Nimish to confirm)
- The 1 Dec rhyme (ACT-K1-0665) is on a `rhymes` lesson, as on 30 Nov. If it is on another head, add that subject code.
- Any K1 `rhymes` lesson may now hold any K1 Music activity, any `clay` lesson any K1 English activity, and so on: the
  setting is per subject code, not per lesson. Narrower (per lesson or per activity) would be more code for five rows.

## Consequences (bad news first)
- An `other` K1 lesson can now hold a Block Room activity; it still teaches no subject, so no objective or offer
  sequence is attached to it, and the picker's objective tiers (`tt_offer_load`) do not list these activities: the
  coordinator chooses from the lesson's activity list (`tt_heads.offers`).
- A per-grade view of heads (ADR 0113's "proper fix after the pilot") would fold this setting in; until then two
  settings describe a lesson's offers.
- Release: merge → `bin/push-migrations`, and a redeploy of the engine (code changed). Rejected: editing live
  lessons' `subject_code` by hand (lost on the next timetable load); new heads (would teach, ADR 0113 review).
