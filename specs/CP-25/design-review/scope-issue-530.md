# CP-25: The fortnight works end to end, plus the backend's basics (issue #530, draft scope)

**What:** independent reviews of the finished Core backend (9 Nov 2026) found that each piece works on its own, but the fortnight journey breaks after a timetable goes live, and some basics are missing. This scope fixes what blocks real use, each in its smallest working form.

**Done when:**
1. After a fortnight's timetable goes live, or after a lesson is moved by hand, the week can still be drafted and approved. One engine test runs the whole journey on one fortnight with fake data (draft, put live, move a lesson, draft the week, approve a class, approve the fortnight). It fails today and passes after the fix. (Test.)
2. One function says which dates, and which of weeks A and B, a fortnight covers. Drafting, going live and hand moves all use it, and the older copies of the rule are removed. A 14-day fortnight, a 15-day fortnight and one that starts mid-week each give exactly their own school days. (Test per case.)
3. A coordinator can move a fortnight through its states and approve each class, by an engine command and a keyed engine route each. Every action that changes the fortnight or the timetable is allowed only to the group set for it, identified through the sign-in mapping (CP-3). (Test per action: the group is allowed, anyone else is refused.)
4. A setting the school has changed keeps its value when the engine's settings are loaded again; a setting that is not yet there is still added. (Test.)
5. `engine live watch` reports when the nightly rebuild, or the 48-hour voice clean-up, has not run in time. `docs/runbooks/scheduled-jobs.md` lists the exact steps to put both jobs on the server. (Test; LIVE: box-only read.)
6. The "engine logs" workflow prints counts only, never raw log lines, and its comment says what is true for a public repository. (Test: fails if the workflow prints raw log lines.)
7. After the brand pack (#528) is on main: worksheets and print packs made by the engine carry the school logo as the pack's rules say. A parent-report document gets it when one is built (the engine makes only a text draft today). (Test.)

**Out of scope:**
- the restricted-login switch and what must be cleared before it (CP-4's checklist);
- consent and the data register's wording;
- simplifying the parallel mechanisms (settings, approvals, who-did-it);
- the new-year rollover and database indexes;
- a parent-report document;
- the website's own items (UI-15) and library upgrades;
- the backup numbers (CP-24).

Tier 3 (migrations, `.github/`). Line 7 narrowed on 9 Nov 2026 by the orchestrator under Nimish's blanket authority, because the engine builds no parent-report document.
