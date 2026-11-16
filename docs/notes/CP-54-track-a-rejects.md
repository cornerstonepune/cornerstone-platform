# CP-54 track A: rows apply-seed refused at data/final (16 Nov), for the data workers and auditors

Source: a dry run of `engine curriculum apply-seed` on a fresh database with data/final (g1-audit 0d7ec3c, g2-audit e1561f6, g3-audit 3bfa3de, g4-audit e17c5f2; objective files data/g1 554fd8e, g2 f294937, g3 d6252b0, g4 61eac17, k2 9ca5993). Would apply: 1,432 titles, 317 retired, 524 new objectives, 1,456 activities. K2's 1,192 'not an objective of the school' rows are an artefact (no K2 objectives on that database) and are left out.

Counts by band and rule: {"G1": {"l": 5, "0": 7, "b": 1}, "G2": {"l": 4, "w": 2, "0": 9, "b": 44}, "G3": {"l": 1, "a": 1, "0": 4}, "G4": {"l": 2, "0": 1}} and K2 {}

## Objective rows refused (a plain LO-code row is the worker's; a ref starting AUD-, G2A-NEW, G3-NEWA or G4-NEW is a new objective the auditor wrote, now in the objective file)

- G1 AUD-ART-04: rule l: two actions: it asks for more than one thing a child does; one action only
- G1 AUD-HIN-01: rule l: two actions: it asks for more than one thing a child does; one action only
- G1 AUD-PE-01: rule l: 'does' is not a verb of something a child does that can be seen or heard
- G1 AUD-PE-05: rule l: 'does' is not a verb of something a child does that can be seen or heard
- G1 AUD-SCI-01: rule l: two actions: it asks for more than one thing a child does; one action only
- G2 G2A-NEW-001: rule l: two actions: it asks for more than one thing a child does; one action only
- G2 G2A-NEW-003: rule l: two actions: it asks for more than one thing a child does; one action only
- G2 G2A-NEW-022: rule l: two actions: it asks for more than one thing a child does; one action only
- G2 G2A-NEW-025: rule l: two actions: it asks for more than one thing a child does; one action only | rule w: uses 'carried', a word the school does not use
- G3 G3-NEWA-004: rule l: two actions: it asks for more than one thing a child does; one action only
- G4 G4-NEW-053: rule l: two actions: it asks for more than one thing a child does; one action only
- G4 LO-G4-1419: rule l: a list: more than one comma; one action only, no list

## Activity rows refused (the auditor's; a rule-0 row that names a refused new objective is fixed by rewording that objective)

- G1 G1-427: names new objective AUD-SCI-01 (LO-G1-N080), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only
- G1 G1-469: names new objective AUD-HIN-01 (LO-G1-N070), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only
- G1 G1-477: names new objective AUD-PE-01 (LO-G1-N073), which was refused: rule l: 'does' is not a verb of something a child does that can be seen or heard
- G1 G1-478: names new objective AUD-PE-01 (LO-G1-N073), which was refused: rule l: 'does' is not a verb of something a child does that can be seen or heard
- G1 G1-479: names new objective AUD-PE-01 (LO-G1-N073), which was refused: rule l: 'does' is not a verb of something a child does that can be seen or heard
- G1 G1-484: names new objective AUD-PE-05 (LO-G1-N074), which was refused: rule l: 'does' is not a verb of something a child does that can be seen or heard
- G1 G1-492: names new objective AUD-ART-04 (LO-G1-N063), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only
- G1 G1-538: rule b: level 1 opens 'some lines are said with help' as 3 earlier activities' did
- G2 G2-179: names new objective G2A-NEW-025 (LO-G2-N116), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only; rule w: uses 'carried', a word the school does not use | rule w: uses 'carried', a word the school does not use
- G2 G2-368: names new objective G2A-NEW-001 (LO-G2-N092), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only
- G2 G2-381: names new objective G2A-NEW-003 (LO-G2-N094), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only
- G2 G2-401: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-402: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-403: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-404: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-405: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-406: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-407: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-408: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-409: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-410: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-411: rule b: level 0 opens '' as 3 earlier activities' did | rule b: level 1 opens '' as 3 earlier activities' did | rule b: level 2 opens '' as 3 earlier activities' did | rule b: level 3 opens '' as 3 earlier activities' did
- G2 G2-440: names new objective G2A-NEW-022 (LO-G2-N113), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only
- G2 G2-442: names new objective G2A-NEW-022 (LO-G2-N113), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only
- G2 G2-453: names new objective G2A-NEW-022 (LO-G2-N113), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only
- G2 G2-458: rule 0: names 0848, which is not an objective
- G2 G2-460: rule 0: names 0858, which is not an objective
- G2 G2-461: rule 0: names 0897, which is not an objective
- G3 G3-147: rule a: level 3 starts 'The child': say what is seen in the work
- G3 G3-248: names new objective G3-NEWA-004 (LO-G3-N038), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only
- G3 G3-272: rule 0: a look-for says a feeling ('upset'): say what is seen or heard | rule 0: a look-for has 'Calm': no child's name | rule 0: a look-for has 'Corner': no child's name
- G4 G4-260: names new objective G4-NEW-053 (LO-G4-N043), which was refused: rule l: two actions: it asks for more than one thing a child does; one action only

## G2 activities that hit rule b (a level opens the same way as more than three earlier activities): the G2 auditor rewrites these level lines

- G2-401: rule b: level 0 opens '' as 3 earlier activities' did
- G2-402: rule b: level 0 opens '' as 3 earlier activities' did
- G2-403: rule b: level 0 opens '' as 3 earlier activities' did
- G2-404: rule b: level 0 opens '' as 3 earlier activities' did
- G2-405: rule b: level 0 opens '' as 3 earlier activities' did
- G2-406: rule b: level 0 opens '' as 3 earlier activities' did
- G2-407: rule b: level 0 opens '' as 3 earlier activities' did
- G2-408: rule b: level 0 opens '' as 3 earlier activities' did
- G2-409: rule b: level 0 opens '' as 3 earlier activities' did
- G2-410: rule b: level 0 opens '' as 3 earlier activities' did
- G2-411: rule b: level 0 opens '' as 3 earlier activities' did
