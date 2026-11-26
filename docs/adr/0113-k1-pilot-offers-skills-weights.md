# 0113 — K1 pilot: three signed-off activity choices offered, six skill links, K1 observed weights and rule

Date: 2026-11-26. Status: accepted (Nimish's ask, 26 Nov, via the coordinator; written by Plan, unattended); amended the
same day after review (below). Decisions and Consequences say what the code does now.
Goal: none — proved by PROJECT.md M6 G6.4 and G6.7 and their test `packages/engine/tests/test_k1_pilot_offers.py`.

## Why
The F.N 10 K1 lessons are on live, but `tt_heads.ensure_offered` refused the activity choices signed off for them:
K1's activities use their own strand spellings (`Art & Craft`, `Rhymes`, `Sci & Geo`; K2 says `Arts & Crafts`,
`Rhymes & Songs`, `Science & Geo`), several K1 cells hold two parts (Clay + English, Music & Dance + Maths, Memory
drawing + General Awareness), and lessons of subject `other` had no head at all. And a mark on an activity with no
school skill writes no `evidence_event`; `observed.weights` had only K2; K1's `grade` row had no observed rule
(`secure_level` null), so `graph_observed_states` left every K1 child out.

## Decisions
1. `timetable.heads` gains these groups (nothing removed, no G1–G4 head touched, no head teaches a new subject):

| Head | Added groups | For |
|---|---|---|
| art | Art & Craft | ACT-K1-1202 Paint the branch (27 Nov) |
| rhymes | Rhymes | ACT-K1-F001 (P1, 26 Nov) |
| music | Rhymes | ACT-K1-F001 (Music (Guest) P2, 26 Nov) |
| general_awareness | Sci & Geo | K1's own spelling |
| memory_drawing | Sci & Geo (had none) | ACT-K1-0630 (Memory drawing + GA cell, 30 Nov) |

   Not offered yet, a ticket (PROJECT.md G6.8): ACT-K1-0665 French rhyme (30 Nov, 1 Dec), ACT-K1-F003 (30 Nov),
   ACT-K1-0783 Smelling Bottles (1 Dec), ACT-K1-F002 (2 Dec). Each needs a head to offer a group without teaching it.

2. The six new F.N 10 activities get one school skill each, the closest skill other K1 activities already reach on
   live (26 Nov). **Nimish to check each:**

| Activity | Skill | Why |
|---|---|---|
| F001 The Sun And The Moon | LIT.SPK.05 Rhymes & songs: joins in and recites | 100 K1 rhymes use it |
| F002 Number tracing 5 and 6 | MOT.PRW.05 Number formation in square notebook | K1 maths number writing |
| F003 Trace and write R and D | MOT.PRW.04 Letter formation on four lines | K1 "Writing Alphabet" rows |
| F004 Name of farm animals (Hindi) | HIN.VOC.01 Hindi vocabulary | no K1 Hindi activity has a skill; closest school skill |
| F005 Swar ए | HIN.VARN.01 Vowel & consonant letter recognition | same; no K1 row reaches it yet |
| F006 Memory Drawing | ART.VIS.03 Representational drawing with detail | K1 "Memory drawing Diwali" uses it |

   Linked as `source = 'school'` like the other K1 links, because a `machine` link is never evidence.
3. **Assumption for Nimish:** K1 counts an observed record exactly as K2 does (`observed.weights.K1` = K2's), and K1's
   observed rule copies K2's secure level (3), secure days (2) and recheck days (14). `min_adults` is **not** copied: K1
   stays at **2 adults** until Nimish confirms 1. Without a rule K1 has no observed picture at all. Say if K1 should differ.

## How it reaches live
`timetable.heads` and `observed.weights` are `seed_once`: `engine load --settings` writes them once and never again,
so changing `config.json` alone would never reach live. As ADR 0111 did, a migration
(`20270218090000_k1_pilot_offers.sql`) says it for loaded databases; `config.json` says the same for new ones. Release:
merge → `bin/push-migrations` (or `migrate live`) applies the migration; nothing else needs running (no engine code
changed, so a redeploy is not needed for this). The migration only adds and is safe to run twice.
It raises if an existing ACT-K1-F00x ends with no skill link (a machine link does not count: it is never evidence).

## Consequences (bad news first)
- **Five of the eight signed-off lessons still refuse their activity** (0665 twice, F003, 0783, F002) until the G6.8
  ticket; the first is 30 Nov. Three can be attached: F001 (26 Nov), 1202 (27 Nov), 0630 (30 Nov).
- **K1 `secure` needs 2 adults** while K2 needs 1, until Nimish says.
- The added strand spellings are used by no K2 activity in `registry.json` (K1 and Nursery spell them so), so K2 is
  offered nothing new.
- `ensure_offered` and `offers` read `activity.band` only, not `also_bands`: ACT-K2-M0018 (clay carrot, shared with K1
  by ADR 0111) is still refused on a K1 clay lesson whatever this setting says. Code, not seed: a ticket.
- Heads are not per grade. Proper fix after the pilot: a head's groups by grade (product code, a ticket).
- Rejected: changing the K1 lessons' `subject_code` on live (data edit by hand, lost on the next timetable load).

## Review, 26 Nov: the first version failed
A head's groups also say which subject it teaches (`tt_heads.subjects_of`, `heads_in`: offer sequence, objectives, who
may edit), K2 included. The first version added rhymes+`Music`, music+`Maths`, clay+`English` and a new `other` head
(+`Block Room`), each of which made a head teach a new subject, and copied K2's `min_adults` 1. All were dropped. The
groups kept are spellings live reads as no subject (`test_no_head_comes_to_teach_a_new_subject`).
