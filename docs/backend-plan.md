# K2 backend plan: the 20 scopes that finish the backend

Source: the reconciliation of Teacher OS Roadmap v23 against the code and the live database, 2026-11-08
(https://claude.ai/code/artifact/10633d1c-438c-4f4f-8341-3ae82770e1ae). This file is the one list of what remains.

**No status is written here, on purpose.** A line of prose goes stale; a proof does not. Status comes from the harness:
`athena status` (what is locked, built, finished), `specs/<ID>/status.json`, `specs/<ID>/VERIFY.md`, and the nightly CI run
that re-runs every finished spec on main. A scope is finished only when `athena done <ID>` passes and, for goalposts marked
LIVE, its read-only box proof (`check_box`) has passed on the live database after deploy.

## What we are building now (Nimish, 9 Nov 2026)

**Working backend = every scope tagged Core in the table below, finished.** This is the software the school runs on:
the people, the skills and curriculum, the observations (typed and by voice) that become evidence, the month and the
week, the activity of every period, and the timetable that replaces the spreadsheet. Nothing else is needed for it.

- **Core** is the working backend. Build it, in the order of the Waits-for column, and stay inside it.
- **Next** comes only after Core is working: CP-14 (confirmed skill links, "ready next") and CP-19 (reports and the
  coordinator's list).
- **Later** is parked, not cancelled: CP-15 and CP-16 (curriculum completeness and the mapping agents), CP-17 and
  CP-18 (inventory and materials). They are built when the school asks for them.
- **Full backend** = Core, Next and Later all finished, the nightly run green, every LIVE proof passing. It is the
  long-term target, not the thing we are working toward now.

Rules that keep us inside Core (Nimish, 9 Nov 2026):

1. **Voice is the most critical part.** CP-10 is Core and is not gated by the Sarvam letter. The Sarvam
   "no retention in writing" is recorded as a setting and chased, never a gate. Our own side is safe without it:
   raw audio and raw transcript copies are deleted after 48 hours, and nothing of either enters git or a log.
2. **Access rules are not a gate.** CP-3 and CP-4 built the structure (groups, kinds, the table list) and it stays,
   inert until the website connects as the restricted login. No scope waits on more role-rule work. What must be
   cleared before that switch is the checklist in `docs/notes/CP-4.md` ("Before the site is switched to the
   restricted login"). Switching it on is Nimish's step, later.
3. **Lean first.** A scope is built in its simplest working form. A heavier form (database-enforced approvals,
   clash triggers, never-lose guarantees, anything that guards against a risk the school does not have yet) is added
   when it is needed. CP-6, CP-7, CP-12 and CP-21 are being reduced to their simplest working versions; a reduced
   scope replaces its long version only after Nimish types `UNLOCK <ID>` for it.
4. **Build in parallel, merge one at a time.** Up to three builds at once, each on its own branch from main.
   Merges stay one at a time, each on the verifier's PASS and real tests green.
5. **No new scope joins Core without Nimish.** Adding, splitting or dropping a scope is a change to this file in a
   pull request Nimish approves, never a quiet edit.

**Full backend done = CP-1 to CP-19 and CP-21 all finished, the nightly run green, every LIVE proof passing.**

## The scopes

Each scope goes through the full loop (tier 3 unless stated): issue drafted with What / Done when / Out of scope, design
reviewed (EGM), Nimish adds `scope-locked`, proofs written first and locked, built test-first, independently verified,
shipped. One database change at a time (shared contracts, one task at a time).

| ID | Scope | Waits for | Roadmap task | Wave | Phase |
|---|---|---|---|---|---|
| CP-1 | People, complete: all staff loaded, moving a child moves enrolment, every edit logged | none | M0-05 | 1 | Core |
| CP-2 | A request says who is asking: the identity reaches the database, proved on the real pooler | none | M0-08 (a) | 1 | Core |
| CP-3 | Role rules on children, enrolment, staff and notes | CP-1, CP-2 | M0-08 (b) | 1 | Core |
| CP-4 | Role rules on every other table, one test per role, no rule left that allows everyone | CP-3 | M0-08 (c) | 1 | Core |
| CP-5 | Database hygiene: fixed search path on 35 functions, leaked-password protection, live address out of old docs | none | advisors | 1 | Core |
| CP-6 | The month cycle: state, dates as settings, freeze enforced by the database | CP-4 | M1-12 | 2 | Core |
| CP-7 | The week: draft, approve only what changed, an unchanged week rolls forward | CP-6 | M1-06 | 2 | Core |
| CP-8 | Every period opens its activity: plan lines linked to activities | CP-4 | M1-06, M1-09 | 2 | Core |
| CP-9 | Observations become evidence for real, through the typed form: nightly rebuild, correction, "unplanned" computed | CP-4 | M1-01..04a | 2 | Core |
| CP-10 | Voice on: Sarvam retention recorded as a setting, 48-hour clean-up of our raw copies scheduled, 20 real notes confirmed | CP-9 | M1-01 | 2 | Core |
| CP-11 | Timetable generator: a draft from the rules via FET, one command, unmeetable rules reported, FET proved on the box | none | M1-14 | 3 | Core |
| CP-12 | Timetable by hand: moves kept with who, clashes detected and accepted (the same-adult check comes with grades 1-4) | CP-21 | M1-14 | 3 | Core |
| CP-13 | Child level rule: a repeating mistake clears, one adult counts once, minimum adults per grade | CP-4 | M0-07 | 3 | Core |
| CP-14 | Skill links a person confirmed, and "ready next" per activity | CP-13 | M1-15, M1-17 | 3 | Next |
| CP-15 | Curriculum complete: agreed page format, no empty part on any K2 activity, every draft checked | page format | M1-11 | 4 | Later |
| CP-16 | Mapping agents: full 427 run, bars decided, one command undoes a run | CP-15 | M1-05 | 4 | Later |
| CP-17 | Inventory: stock and issue records, rupee threshold, educator approval of the month's list | CP-6 | M1-13 | 4 | Later |
| CP-18 | Materials: reading prompt scored and on, sends recorded, reminders delivered | CP-17 | M1-10, M1-16 | 4 | Later |
| CP-19 | Reports and the coordinator's list: per-line two approvals, consent before any send, counts that match the database | CP-4, CP-9 | M1-07, M1-08 | 4 | Next |
| CP-21 | A timetable draft goes live: the fortnight by date, sessions updated in place, freeze respected, hand moves never wiped unrecorded (split out of CP-12, 8 Nov) | CP-11, CP-6 | M1-14 | 3 | Core |

Interface work (screens, buttons, menus) is not in these scopes. It waits for the frontend revamp and is listed in the
reconciliation page for reference.

## Open decisions

| Decision | Gates | Recommendation |
|---|---|---|
| Lowered mapping bars | CP-16 (Later) | Amend the roadmap after the full run |
| One model activity page | CP-15 (Later) | Three layouts of one real activity; Nimish picks |

The Sarvam "no retention in writing" no longer gates anything (Nimish, 9 Nov 2026): it is a recorded setting under CP-10,
chased in parallel. It is not a reason to wait.

Decided by Nimish on 8 Nov 2026 and no longer open: load all 7 staff (CP-1); access is three simple groups, kept as
rows so it can change (CP-3, CP-4); the FET install was merged by him (CP-11); the timetable work is split into CP-11
(a draft), CP-21 (a draft goes live) and CP-12 (by hand), in that order; a hand move changes only its own fortnight and
only the coordinator group accepts a clash (CP-12); nursery to K2 have one educator for all lessons, so the same-adult
check is not needed now and comes with grades 1-4, where subject educators teach (CP-11, CP-21, CP-12 keep room for it).
