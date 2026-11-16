# CP-62 (#794): Checking a paper in one flow

### What
Nimish, 16 Nov 2026, on the paper page: "I'm not able to understand how I navigate the page. There should be a way to click the entire assessment and look at the page, zoom in and out. At question level, it should only open the snapshot of that question. Those red tags are very difficult."
The page as photographed is the main thing, with zoom (buttons, wheel, pinch, drag, fit). A strip of numbered questions coloured by state replaces the wall of red pills (the per-skill summary stays, collapsed to one line). Choosing a question shows only that question's cropped snapshot with four large buttons: Right, Wrong, Wrong with working, Blank (three signals stay three), and the way on. Keys: 1-4 mark, ← → move. "Next to judge" jumps to the next red one; a progress bar says "6 of 10 judged".

### Done when
1. The paper page opens on the whole paper as a zoomable picture; zoom in, out, fit and the wheel change its scale.
2. A strip of numbered questions shows each one's state (right, wrong, wrong with working with a pencil, blank, to judge), the counts keep right, wrong, wrong with working and blank apart, and the per-skill summary is collapsed with no red pill per answer.
3. Choosing a question shows only that question's cropped snapshot; Next to judge goes to the next red one; "The whole paper" goes back.
4. Every question to judge can be marked from the page with the buttons; each mark saves once as the right signal (wrong with working is a wrong answer whose working shows) and the counts and "n of m judged" follow.
5. Keys 1 to 4 mark the question in view, ← and → move between questions.
6. At 400 px the strip wraps and the page does not scroll sideways.

### Out of scope
Database changes (none needed: the working signal is the existing `working_shown` column). Re-marking an answer the engine already settled (the question's tools under the table keep that). Names of children.
