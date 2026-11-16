# CP-54 review, round 4 (16 Nov 2026)

**What was reviewed:** `origin/data/final` @ cb9a545, using only `lo_rewrites/<band>.json` and `activities/<band>.json`. The `audit/` files are held back and were not reviewed.

**Sample** (random seed 20261117, no round-3 rows reused):
- 40 LOs per band, plus 20 near-twin rows for K2.
- 35 activities per G band: 12 based on an educator plan and 23 inferred, plus up to 5 activities flagged `needs_link`.
- 15 new LOs per band.
- Up to 10 rows per band that failed in round 3, rechecked.

**Rubric:** the same as round 3. Basis honesty is checked per row. A missing "Suggested:" prefix is counted across the whole file, not as a per-row error.

**Drive:** 12 reads, read-only. Six documents read in round 3 were reused from memory.

**How the verdicts were made:** one reviewer agent per band applied the single written rubric. I merged the Drive evidence and spot-read their output. Every verdict, with its reason and fix, is in `CP-54-review-round4.json` (`rows` and `failing_rows`).

## Verdict per band (bar: 10 % errors or fewer)

| Band | LO error (random) | LOs | Activity error (random 35; weighted by basis*) | Activities |
|---|---|---|---|---|
| G1 | **2.5 %** (1/40) | **LOAD** | 51 % (18/35); weighted 52 % | DO NOT LOAD |
| G2 | 15 % (6/40) | DO NOT LOAD (6 small condition fixes away) | 31 % (11/35); weighted 31 % | DO NOT LOAD |
| G3 | 15 % (6/40) | DO NOT LOAD (6 condition fixes away) | 71 % (25/35); weighted 71 % | DO NOT LOAD |
| G4 | 17.5 % (7/40) | DO NOT LOAD | 37 % (13/35); weighted 41 %. Educator-plan rows alone: **8 % (1/12)** | DO NOT LOAD (a load of educator-plan rows only is defensible) |
| K2 | 12.5 % (5/40); near-twin rows 10 % (2/20) | DO NOT LOAD (just over the bar) | none | none |

\*"Weighted" combines the error rates of the plan rows and the inferred rows in proportion to how many of each the file holds.

**New LOs:** error rates are 20 % (G1), 13 % (G2), 20 % (G3), 20 % (G4) and 40 % (K2). Every band is over the bar.

**Sample size.** These are samples of 40 rows. A count of 1 failing row in 40 puts the true rate below about 13 %, with 95 % confidence. A count of 5–7 failing rows puts it anywhere from roughly 5 % to 30 %. So G1's LOs pass clearly, and K2 sits on the line.

## What the round-3 failures look like now

**Fixed:**
- Every routine or purpose LO in the recheck sets is now folded (`fold_into_unit`): G1 0097, 0105, 0151, 0152, 0173, 0232; G2 0712, 0732, 0900; G3 0997, 1048; G4 1504, 1636, 1721.
- Missing conditions are added: G2 0492, 0644, 0686; G3 0960, 0982, 1057, 1113; G4 1591, 1640, 1670.
- K2 near-twins: the families are folded, no title repeats, and no row says "story N" any more.
- G3-009, G3-049 and G3-112 are fixed.
- G2-002's basis is now `inferred`, with "Suggested:" on its steps.

**Still present:**
- G1-059, G1-062, G1-071, G1-099: the levels or LO links still don't match.
- G2-141: a gradable skill activity is set to `levels: null`.
- G2-055.
- G4-048, G4-069, G4-134, G4-136.
- K2: the row kept in each folded family (Dance 0158-1, Clay 0177-1, Hindi 0517-1) still carries an act that its own note calls assumed.

## Basis honesty

- **Activities marked `educator_plan`.** I checked 44 against Drive, and 42 are faithful to the cited document:

  | Band | Faithful |
  |---|---|
  | G1 | 10 / 10 |
  | G2 | 8 / 10 |
  | G3 | 10 / 10 |
  | G4 | 12 / 12 |

  - The two G2 exceptions are G2-127 and G2-133. Each adds one step while its note says "Steps follow the educators' planner cell".
  - G1-225 and G1-226 disclose a "common sense" closing step under `educator_plan`. That is a minor mislabel.
  - Planner rows are now faithful too. G2-049 and G2-050 (planner B20) and G4-053 (planner D9) match their cells. In round 3 only 1 of 10 planner rows did.
  - Six rows were not checked, because no read was left for their documents. They cite PDFs, "Hindi research 2026", the ICT curriculum and the Scratch worksheets.
- **Faithful is not the same as correct.** G3's plan rows are 10 of 10 faithful on Drive, yet 7 of 12 fail. Their levels grade the craft rather than the linked LO, or the LO link is wrong.
- **Activities marked `inferred`.** The step prefix "Suggested:" is missing across whole files:

  | Band | Inferred rows without the prefix |
  |---|---|
  | G1 | 367 / 367 |
  | G2 | 189 / 381 |
  | G3 | 180 / 180 |
  | G4 | 184 / 184 |

  G1, G3 and G4 disclose the invention in the note instead. This is a labelling job, not a content error.
- **`needs_link` rows.** 8 of 16 sampled are not real activities: G1 3/5, G2 4/5, G3 1/2, G4 1/4. They were built from a value-education theme, a routine's purpose or an event name. Examples: G2-423, 429, 432; G4-099; G1 Quiz and Play-based rows.

## The failure patterns that remain

1. **Inferred activities whose cell names only a topic, an event or a purpose.**
   - Wrong: G1 4/23, G3 8/23, G4 8/23.
   - Examples: G3-016, 020, 025 (unit topic bullets); G4-033, 079 (topic or event); G1-003, 168, 171.
   - **Fix:** remove these rows, or set them to `needs_human`.
2. **Levels that grade something other than the linked LO, or a wrong LO link.**
   - Examples: G3-127, 149, 153, 162, 198; G1-389, 393; G2-345, 049; G4-048.
   - **Fix:** rewrite the levels so level 2 states the linked LO as written.
3. **LOs with no condition, or with an inner state or a quality word as the condition.**
   - Examples: G2-0737, 0841; G3-0979, 1029, 1082, 1291; G4-1474, 1542, 1585, 1363, 1750; K2-0088-1, 0679-1.
   - New LOs that duplicate an existing LO: G2-NEW-012; K2-NEW-5-033, 5-005, 5-057 against the R2 series.

## Example failures (3 per band and kind)
- **G1 lo:** LO-G1-0195 (fix) Source is only the heading 'Speaking'; the rewrite borrows another row's content and nearly repeats LO-G1-0197 (says wha
- **G1 new_lo:** AUD-VE-03 (wrong) Grades conduct and honesty (telling the truth about a mistake in a game), a character behaviour, not a learning objectiv; AUD-RTN-05 (wrong) Taking part in a school music event is built from an event name: joining in is participation, not a learning outcome, an; G1-NEWLO-010 (fix) Nearly repeats LO-G1-0076 (answers a question using the data in a table or chart); it needs a pictograph-specific condit
- **G1 activity:** G1-003 (wrong) Cell B4 gives only the topic (punctuation recognition), as the note admits, so the activity itself is invented; G1-168 (wrong) The cited cell gives only the Quiz's purpose ('reinforces concepts'); the rubric already names Quiz as purpose-only, so ; G1-171 (wrong) The syllabus cell gives only three purpose lines for the bank visit; the rubric names a bank visit with assumed steps as
- **G2 lo:** LO-G2-0530 (fix) Original is about solving multi-step problems with bar models; the rewrite only draws the model and drops the solving.; LO-G2-0587 (fix) Original asks to record times and interpret durations; the rewrite keeps only the recording and silently drops the durat; LO-G2-0720 (fix) अनुश्रवण-लेखन is dictation; 'writes down what they heard after listening' reads as a summary and has no clear condition.
- **G2 new_lo:** G2-NEW-012 (fix) Duplicates G2-NEW-061 (same unit, feature of a classmate's project after testing) and joins two outputs (a good point an; G2A-NEW-017 (fix) Two outputs (numerals and words) and no condition; one action with a card condition.
- **G2 activity:** G2-423 (wrong) Cell names only a value-education theme ('Kindness & Inclusion, week 1'); the circle and role-play steps are invented.; G2-429 (wrong) Cell names only a value-education theme ('Conflict resolution, week 3'); the story and steps are invented.; G2-432 (wrong) Cell names only a value-education theme ('Self-regulation, week 2'); the hand-squeeze strategy and steps are invented.
- **G3 lo:** LO-G3-0979 (fix) No condition: "finds shapes" says neither from what nor how (siblings name fold, mirror, grid).; LO-G3-1029 (fix) No condition: the "such as" examples name the content, not where the change is seen; give the picture or demonstration.; LO-G3-1082 (fix) "With the rhythm shown by its lines" is not clearly heard (like "with feeling"); name the source poem and the features h
- **G3 new_lo:** G3-NEWA-007 (wrong) Values-education LO from the Value Ed G1-3 sheet: it grades conduct/character, which the rubric keeps ungraded (look_for; G3-NEW-033 (wrong) Invented from a field-visit event name: LO-G3-1047 (Science Park) is purpose-only, the same ruling that folded LO-G3-104; G3-NEWA-004 (fix) No condition (round-1 ruling: "writes the numerals correctly" is a fix); add from memory or from a number chart.
- **G3 activity:** G3-016 (wrong) Activity invented: the note says it was built from unit topics (Calculating durations/intervals) and no plan describes i; G3-020 (wrong) Activity invented: built from unit topic bullets (2D shapes, tessellation, symmetry); the cell names no activity.; G3-025 (wrong) Activity invented: "Class shop" is built from Money unit topics; the cell names no activity.
- **G4 lo:** LO-G4-1736 (wrong) Theme-Based Learnings is a named round-1 purpose-only routine; "links ideas from two subjects in a project" is assumed f; LO-G4-1542 (fix) No condition: "between two characters" does not say from what; anchor it to the lesson's picture story.; LO-G4-1474 (fix) No condition: "in order" is a quality; the source names the fable read in the unit, so use it.
- **G4 new_lo:** G4-NEW-002 (fix) No condition and ambiguous: "names a Marathi noun as" does not say the noun is given; make it a given word.; G4-NEW-053 (fix) "Identifies" is close to "recognises" (not observable); make the seen action naming; G4-NEW-064 (fix) "even when unsure of a word" is an inner state, not observable; drop it.
- **G4 activity:** G4-033 (wrong) The cell names only a topic ("What is Fabric? Types and origins") with syllabus objectives; the sample-sorting circle is; G4-079 (wrong) The cell names only an event (National Science Day) and a topic (Raman Effect); the story, circle and poster are invente; G4-099 (wrong) Play-Based Learning is a named round-1 purpose-only routine and the note admits the activity is not described in the cel
- **K2 lo:** LO-K2-0266-2 (wrong) The note says the source line is only 'use water properly' and pouring is assumed; LO-K2-0272-1 (wrong) The source names only cleanliness and practical life skills, and the note says sweeping is assumed; LO-K2-0088-1 (fix) 'Picturing the objects in their head' is an inner state, not something seen; state the condition as working without obje
- **K2 new_lo:** K2-NEW-3-018 (wrong) Invented content: its source is 'types of voices' (high and low voice), and clapping the letters of a friend's name is n; K2-NEW-5-010 (wrong) It comes from LO-K2-M0011-1, whose note says 'purpose-style source; observable act inferred' (a values line on honesty); K2-NEW-5-033 (fix) It duplicates the existing LO-K2-0845-1 ('answers simple questions about The Wolf in Sheep's Clothing'), which is the sa

## Packet caveat

Links to `G2A-NEW-*` and some `G3-NEWA-*` LOs showed as "[?]" in the reviewers' packets. This came from the way I built the packets, not from the data, and no row was failed for it. G3-268 and G3-309 still link G3-NEWA-007, which is graded conduct and judged wrong. That link should be dropped.
