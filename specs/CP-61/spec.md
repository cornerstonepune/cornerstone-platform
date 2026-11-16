# CP-61 (#787): One card on the Assessments board, one compact list in its panel

### What
Nimish, 16 Nov 2026: the Assessments board's cards cut their text, differ in height and wrap their buttons; the panel's copies list shows a red "for you to judge" pill on every row. "That consistency is not there."
One card layout for all four columns: the title wraps in full (three lines, then cut with the full title on hover and focus), a subtitle line (class · date), a progress line ("n of m papers back"), one status chip that wraps below instead of clipping, one primary button of one size whose label never breaks mid-word. In the panel's copies list: Sr. No. (no names), the status in words ("Results in", "To judge n"), one tap to open that paper, and one header line summing the answers to judge.

### Done when
1. At 400, 768 and 1440 px no card text is clipped: title, chip and button have scrollWidth <= clientWidth and stay inside the card.
2. A card has a title, a class-and-day line, a "n of m papers back" line and exactly one chip.
3. Cards in one column share one height; every card button has one size.
4. The panel lists each paper once with Sr. No. and its "To judge n" or "Results in", with no per-row red pill; a header line says "n answers to judge on m papers" once; a tap on a row opens that paper.

### Out of scope
Names of children (the privacy question is undecided). Any change to the lanes, their order or counts. A new board. Database changes.
