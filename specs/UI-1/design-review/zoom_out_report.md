# EGM stage 5: zoom-out and inventive-catalyst review

Target: the frontend design (SPEC.md as of frontend-vision 45f1246), reviewed as the design for slices UI-1..UI-12.
Two fresh reviewers (zoom-out, inventive-catalyst). Condensed by the orchestrator; the reviewers' wording is kept where it matters.
Orchestrator's note on verification: "screens.json is missing" (zoom-out blocker 1) is a gap in the review set, not in the repository: the file exists on frontend-vision.

## Both reviewers found (highest confidence)

1. **UI-1 is too big and cannot finish on its own.** 11 done-when lines. The hex-colour purge needs the old blocks moved onto tokens (which is UI-2's scope), and the inventory test has no built screen to run on (all 33 are fixme until UI-3+). Suggested: split UI-1 (tokens, fonts, purge, contrast) from AppFrame and menu; or have UI-1 move existing blocks and prove the test against one real page.
2. **The design contradicts docs/ux-rules.md and nothing says which wins** (rule 11 no sidebar vs the rail; "Viewing" control vs acting-as; the four menu groups; phone not a gate vs 400 px everywhere). UI-1 must list ux-rules.md as a file it changes and say which rules it supersedes.
3. **Links to unbuilt screens fail check 3.** Many links point at slices built later (Materials, Reports, Fortnight, Assessments). Need one rule: a control whose target is not in merged_slices is not drawn and its test is a fixme.
4. **Controls that link to their own page, and writes done by plain links**, fail check 2 (Forgot, School list, Notes to read, Preview, each job, Later, Make: links that create records; Rename vs the built-name rule).
5. **Phone gate is inconsistent**: 44 px targets with 8 px gaps cannot fit 8 columns in 400 px; only Record and Confirm are designed for the phone. Suggested: full 400 px gate on 5 screens, smoke check elsewhere; 6 columns on phone; drop the "cards on a phone" second render.
6. **Link colour equals the late/red colour** (#9c4626) and the main-action colour has three answers (clay, link, basalt). Haldi outline fails its own 3:1 border proof.
7. **The 12 px eyebrow carries status facts** ("109 waiting"), against the under-14 px rule.
8. **"One count on the site" is contradicted** by tile counts, eyebrows, Setup cards. Define it as the bar badge only; make do-now and this-week disjoint.
9. **Nothing owns creating a note for "Type the marks"**, and Record is entered from pages with no lesson.
10. **Names test uses "a list of real names kept off the repository"**, which a public CI cannot read. Replace with an allow-list of fake names (stronger, nothing secret).
11. **Rule 7 (filter row at 6+ rows) is broken by the design's own tables**; "a class is a grid, never a table" is broken by Classes and children.
12. **Slice dependencies wrong**: Timetable (CP-22) and rules (CP-11) sit in UI-5 not UI-6; Sign in lands on Today (UI-7); the section 4 order list disagrees with the 12-slice table.
13. **Rule 8 "a view, never a permission" vs about 35 "refused" done-when lines.** Refusal belongs to the database lane (CP-3/CP-4); the UI should test absence only.
14. **Nimish cannot judge the scopes**: no plain-English half page per slice saying what he will see and click.

## Options that cut the work (each is a trade-off for Nimish or the spec owner)

- A. Dissolve UI-2 (the blocks and a gallery page): build each block in the first slice that uses it. Saves a gallery and about 21 x 2 x 2 screenshots.
- B. Cut blocks from 21 to about 13 (merge StackBar/LevelBars, Spark/Trend, the grids); drop ChildGraph for a table with "seen N times".
- C. Drop the dark theme from the test matrix (about half the baselines); Nimish never asked for dark.
- D. Merge Fortnight, Draft and Moves into one coordinator screen.
- E. Drop the /search results screen; keep the typeahead (removes one screen and four done-when lines).
- F. Define the rail once per kind of node, not per screen (about a third fewer listed controls).
- G. Fold UI-10 (as-built document) into the inventory test's own report.
- H. Install only the shadcn parts a built screen uses; reuse DataTable, StatusChip, FilterBar.
- I. Drop the eight subject colours (four near-identical browns/ambers); needs Nimish, who approved them on 9 Nov.
- J. Self-host the fonts (next/font): no third-party request on pages that show names.

## Smaller

Sample dates are on the wrong weekdays (18-Nov-2026 is a Wednesday). Section order is 1-4, 7, 5, 6. White-ground decision says "five chips" and "font not decided" (both stale). tokens.json has `"fonts": []`. Devanagari undecided though section 3 says nothing is open. "Hover shows it" conflicts with keyboard/touch. Setup holds Activity/Objective/Skill though educators walk them daily. The trail is not defined (hierarchy or history).

## Not checked by the reviewers

apps/web code, screens.json, build-spec.mjs. Contrast figures were estimated by eye; UI-1's script must confirm.
