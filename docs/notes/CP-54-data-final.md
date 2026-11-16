# CP-54: reconciling the workers' objective files with the auditors' activity files (16 Nov)

Mechanical only: no one's wording changed. Objective files from data/g1..g4 and data/k2; activity files from data/g1-audit..g4-audit.
- `new_los` of both are now one list, in the objective file; the activity files' `new_los` are empty. The worker's wording wins where a ref is in both (in either of his files); refs only the auditor made stay when an activity names them, and go when none does.
- An activity that linked an objective the worker folded now links the real objectives of that unit (up to two); one with none left has no `lo_codes` and `needs_link: true`, for the skill-link CHOOSE machine to fill.

| band | activities | relinked | needs_link | new objectives | dropped (unreferenced) | ref conflicts |
|---|---|---|---|---|---|---|
| G1 | 510 | 6 | 7 | 91 | 1 | 6 |
| G2 | 440 | 0 | 18 | 117 | 1 | 4 |
| G3 | 289 | 19 | 2 | 41 | 0 | 15 |
| G4 | 249 | 9 | 4 | 64 | 10 | 11 |

## Ref conflicts (same ref, different wording; the first kept)

- G1 G1-NEW-001 (also in the auditor): kept "The child names a full stop or a question mark when shown a sentence."; other "The child names a full stop, comma, question mark or exclamation mark in a sentence."
- G1 G1-NEW-010 (also in the auditor): kept "The child names two ways water is used at home or school when shown pictures of daily tasks."; other "The child names two ways water is used at home or school."
- G1 G1-NEW-012 (also in the auditor): kept "The child ties a knot in thread by following the educator's demonstration."; other "The child ties a knot in thread."
- G1 G1-NEW-017 (also in the auditor): kept "The child matches pairs of same-sounding words that are spelt differently using word cards."; other "The child gives two words that sound the same but are spelt differently."
- G1 G1-NEW-036 (also in the auditor): kept "The child turns on the spot to face a direction called out by the educator."; other "The child stretches both arms overhead on the spot when asked."
- G1 G1-NEW-040 (also in the auditor): kept "The child names parts of a plant, such as a leaf or a stem, when shown a real plant."; other "The child names the root, stem, leaf and flower when shown a real plant."
- G2 G2-NEW-003 (also in the auditor): kept "The child makes a project page about me and my family with drawings and sentences in Hindi."; other "The child makes a poster of people who help them with drawings and sentences in Hindi."
- G2 G2-NEW-051 (also in the auditor): kept "The child corrects the card that is in the wrong place in a picture sequence."; other "The child finds and corrects the card that is in the wrong place in a picture sequence."
- G2 G2-NEW-058 (also in the auditor): kept "The child writes a two or three line paragraph in Hindi about a school activity they took part in."; other "The child writes a two or three line paragraph about a school activity with a drawing."
- G2 G2-NEW-061 (also in the auditor): kept "The child writes one feature of a classmate's project after testing it."; other "The child names one feature they liked in a classmate's project and one idea to try next."
- G3 G3-NEW-001 (also in the worker's activity file): kept "The child gives one thing that works well and one suggestion for improvement when reviewing a classmate's work, using the Plus/Delta frame."; other "The child gives one thing that works well and one suggestion for improvement when reviewing a classmate's work."
- G3 G3-NEW-001 (also in the auditor): kept "The child gives one thing that works well and one suggestion for improvement when reviewing a classmate's work, using the Plus/Delta frame."; other "The child gives one thing that works well and one suggestion for improvement when reviewing a classmate's work."
- G3 G3-NEW-014 (also in the auditor): kept "The child gives the x and y position of a sprite on the Scratch stage, using the stage grid."; other "The child gives the x and y position of a sprite on the Scratch stage."
- G3 G3-NEW-015 (also in the auditor): kept "The child builds a four-question quiz in Scratch that responds to right and wrong answers."; other "The child builds a Scratch quiz that asks a question and responds to the answer."
- G3 G3-NEW-016 (also in the auditor): kept "The child plans a Scratch game on paper before building it, listing each sprite's job."; other "The child plans a Scratch game on paper before building it."
- G3 G3-NEW-017 (also in the auditor): kept "The child writes down what a tester does while playing their game, without helping them."; other "The child tests a program on another person and notes one thing to fix."
- G3 G3-NEW-018 (also in the auditor): kept "The child sorts nouns into व्यक्तिवाचक, जातिवाचक and भाववाचक संज्ञा using a wall chart."; other "The child sorts Hindi words into groups of naming words (संज्ञा)."
- G3 G3-NEW-019 (also in the auditor): kept "The child rewrites a sentence by replacing a noun with a pronoun (सर्वनाम)."; other "The child replaces a noun with the right pronoun in a Hindi sentence."
- G3 G3-NEW-020 (also in the auditor): kept "The child acts out a मुहावरा using gestures so a partner can guess it."; other "The child acts out a Hindi idiom (मुहावरा) for others to guess."
- G3 G3-NEW-021 (also in the auditor): kept "The child writes a four- or five-line paragraph of their own story ('मेरी कहानी') in Hindi."; other "The child writes a short story of their own in Hindi."
- G3 G3-NEW-022 (also in the auditor): kept "The child names the greater of two 4-digit numbers shown with place-value blocks."; other "The child compares and orders numbers up to thousands using place value."
- G3 G3-NEW-023 (also in the auditor): kept "The child names the remainder after dividing a number into equal groups with place-value sharing."; other "The child divides a number into equal groups and states the remainder."
- G3 G3-NEW-024 (also in the auditor): kept "The child labels the Blocks Palette, Scripts Area and Stage on a diagram of the Scratch screen."; other "The child names the Blocks Palette, Scripts Area and Stage in Scratch."
- G3 G3-NEW-025 (also in the auditor): kept "The child predicts in writing what the sprite will do when two scripts start on the same green flag."; other "The child runs two scripts at the same time in Scratch."
- G3 G3-NEW-026 (also in the auditor): kept "The child subtracts one amount in rupees from another using a number line."; other "The child changes a noun on a word list to the other लिंग in writing."
- G4 G4-NEW-014 (also in the auditor): kept "The child introduces themselves aloud in Hindi using a sentence frame."; other "The child introduces themselves aloud in Hindi with their name, age and class."
- G4 G4-NEW-020 (also in the auditor): kept "The child writes two lines of the poem 'पोपट' from memory in Marathi, with correct letters and vowel marks."; other "The child writes the lines of the poem 'पोपट' in Marathi with correct letters and vowel marks."
- G4 G4-NEW-021 (also in the auditor): kept "The child tells the class one thing about themselves using a card."; other "The child tells the class three facts about themselves, such as name, family and a favourite thing."
- G4 G4-NEW-025 (also in the auditor): kept "The child types two sentences in a word processor using both hands."; other "The child types two sentences in a word processor, changes font size and text colour, and makes a bulleted list."
- G4 G4-NEW-027 (also in the auditor): kept "The child makes bhel by following its steps in order."; other "The child makes bhel by washing, chopping and mixing the ingredients in the right order."
- G4 G4-NEW-036 (also in the auditor): kept "The child describes the layers of texture in a nature-inspired artwork."; other "The child describes the layers and textures in a nature-inspired artwork."
- G4 G4-NEW-047 (also in the auditor): kept "The child throws a ball at a target in a dodgeball game, following the rules."; other "The child throws at and dodges a ball in a dodgeball game, following the rules."
- G4 G4-NEW-053 (also in the auditor): kept "The child identifies an early-human artefact from a sand-tray dig."; other "The child names what an early-human tool was used for, using a picture of the tool."
- G4 G4-NEW-069 (also in the auditor): kept "The child changes the size and colour of a title in a word processor."; other "The child plays a sport at school with the group, following the rules and cheering others."
- G4 G4-NEW-070 (also in the auditor): kept "The child makes a bulleted list of three items in a word processor."; other "The child makes a handmade card with a drawing and a written message for a friend."
- G4 G4-NEW-071 (also in the auditor): kept "The child dodges a thrown ball in a dodgeball game, following the rules."; other "The child shares their strengths, hobbies and a dream with the class using a drawing."
