# 0113 — K1 pilot: the signed-off activity choices are offered, six skill links, K1 observed weights and rule

Date: 2026-11-26. Status: accepted (Nimish's ask, 26 Nov, via the coordinator; written by Plan, unattended).
Goal: none — proved by PROJECT.md M6 G6.4 and G6.7 and their test `packages/engine/tests/test_k1_pilot_offers.py`.

## Why
The F.N 10 K1 lessons are on live, but `tt_heads.ensure_offered` refused the activity choices signed off for them:
K1's activities use their own strand spellings (`Art & Craft`, `Rhymes`, `Sci & Geo`; K2 says `Arts & Crafts`,
`Rhymes & Songs`, `Science & Geo`), several K1 cells hold two parts (Clay + English, Music & Dance + Maths, Memory
drawing + General Awareness), and lessons of subject `other` had no head at all. And a mark on an activity with no
school skill writes no `evidence_event`; `observed.weights` had only K2; K1's `grade` row had no observed rule
(`secure_level` null), so `graph_observed_states` left every K1 child out.

## Decisions
1. `timetable.heads` gains these groups (nothing removed, no G1–G4 head touched):

| Head | Added groups | For |
|---|---|---|
| art | Art & Craft | ACT-K1-1202 Paint the branch |
| rhymes | Rhymes, Music | ACT-K1-F001 (P1), ACT-K1-0665 French rhyme |
| music | Rhymes, Maths | ACT-K1-F001 (Music (Guest) P2), ACT-K1-F002 (Music & Dance + Maths cell) |
| clay | English | ACT-K1-F003 (Clay + English cell) |
| general_awareness | Sci & Geo | K1's own spelling |
| memory_drawing | Sci & Geo (had none) | ACT-K1-0630 (Memory drawing + GA cell) |
| other (new head) | Block Room | ACT-K1-0783 Smelling Bottles |

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
   observed rule is K2's (secure at level 3 on 2 days, recheck after 14, **1 adult** — K1's default was 2). Without a
   rule K1 has no observed picture at all. Say if K1 should differ.

## How it reaches live
`timetable.heads` and `observed.weights` are `seed_once`: `engine load --settings` writes them once and never again,
so changing `config.json` alone would never reach live. As ADR 0111 did, a migration
(`20270218090000_k1_pilot_offers.sql`) says it for loaded databases; `config.json` says the same for new ones. Release:
merge → `bin/push-migrations` (or `migrate live`) applies the migration; nothing else needs running (no engine code
changed, so a redeploy is not needed for this). The migration only adds and is safe to run twice.

## Consequences (bad news first)
- **K2 lessons are offered more**, because heads are not per grade: K2 rhymes lessons (29 on live) now also list the
  30 K2 Music activities, K2 clay lessons (14) the 62 K2 English ones, K2 music lessons (13) the 87 K2 Maths ones.
  Nothing K2 was offered is lost. The `art`, `memory_drawing`, `general_awareness` additions and the `other` head
  change nothing for K2 (no K2 activity has those strands; no K2 lesson is `other`). Proper fix after the pilot: a
  head's groups by grade (product code, a ticket).
- `ensure_offered` and `offers` read `activity.band` only, not `also_bands`: ACT-K2-M0018 (clay carrot, shared with K1
  by ADR 0111) is still refused on a K1 clay lesson whatever this setting says. Code, not seed: a ticket.
- Rejected: changing the K1 lessons' `subject_code` on live (data edit by hand, lost on the next timetable load).
