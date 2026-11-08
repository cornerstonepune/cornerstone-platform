# K2 backend plan: the 19 scopes that finish the backend

Source: the reconciliation of Teacher OS Roadmap v23 against the code and the live database, 2026-11-08
(https://claude.ai/code/artifact/10633d1c-438c-4f4f-8341-3ae82770e1ae). This file is the one list of what remains.

**No status is written here, on purpose.** A line of prose goes stale; a proof does not. Status comes from the harness:
`athena status` (what is locked, built, finished), `specs/<ID>/status.json`, `specs/<ID>/VERIFY.md`, and the nightly CI run
that re-runs every finished spec on main. A scope is finished only when `athena done <ID>` passes and, for goalposts marked
LIVE, its read-only box proof (`check_box`) has passed on the live database after deploy.

**Backend done = CP-1 to CP-19 all finished, the nightly run green, every LIVE proof passing.** Nothing else counts.
Adding, splitting or dropping a scope is a change to this file in a pull request Nimish approves, never a quiet edit.

Each scope goes through the full loop (tier 3 unless stated): issue drafted with What / Done when / Out of scope, design
reviewed (EGM), Nimish adds `scope-locked`, proofs written first and locked, built test-first, independently verified,
shipped. One database change at a time (shared contracts, one task at a time).

| ID | Scope | Waits for | Roadmap task | Wave |
|---|---|---|---|---|
| CP-1 | People, complete: all staff loaded, moving a child moves enrolment, every edit logged | none | M0-05 | 1 |
| CP-2 | A request says who is asking: the identity reaches the database, proved on the real pooler | none | M0-08 (a) | 1 |
| CP-3 | Role rules on children, enrolment, staff and notes | CP-1, CP-2 | M0-08 (b) | 1 |
| CP-4 | Role rules on every other table, one test per role, no rule left that allows everyone | CP-3 | M0-08 (c) | 1 |
| CP-5 | Database hygiene: fixed search path on 35 functions, leaked-password protection, live address out of old docs | none | advisors | 1 |
| CP-6 | The month cycle: state, dates as settings, freeze enforced by the database | CP-4 | M1-12 | 2 |
| CP-7 | The week: draft, approve only what changed, an unchanged week rolls forward | CP-6 | M1-06 | 2 |
| CP-8 | Every period opens its activity: plan lines linked to activities | CP-4 | M1-06, M1-09 | 2 |
| CP-9 | Observations become evidence for real, through the typed form: nightly rebuild, correction, "unplanned" computed | CP-4 | M1-01..04a | 2 |
| CP-10 | Voice on: Sarvam retention recorded, 48-hour clean-up scheduled, 20 real notes confirmed | CP-9, Sarvam letter | M1-01 | 3 |
| CP-11 | Timetable generator: FET proved on the box, one command, unmeetable rules reported | CP-6 | M1-14 | 3 |
| CP-12 | Timetable by hand: moves kept with who, clashes detected and accepted | CP-11 | M1-14 | 3 |
| CP-13 | Child level rule: a repeating mistake clears, one adult counts once, minimum adults per grade | CP-4 | M0-07 | 3 |
| CP-14 | Skill links a person confirmed, and "ready next" per activity | CP-13 | M1-15, M1-17 | 3 |
| CP-15 | Curriculum complete: agreed page format, no empty part on any K2 activity, every draft checked | page format | M1-11 | 4 |
| CP-16 | Mapping agents: full 427 run, bars decided, one command undoes a run | CP-15 | M1-05 | 4 |
| CP-17 | Inventory: stock and issue records, rupee threshold, educator approval of the month's list | CP-6 | M1-13 | 4 |
| CP-18 | Materials: reading prompt scored and on, sends recorded, reminders delivered | CP-17 | M1-10, M1-16 | 4 |
| CP-19 | Reports and the coordinator's list: per-line two approvals, consent before any send, counts that match the database | CP-4, CP-9 | M1-07, M1-08 | 4 |

Interface work (screens, buttons, menus) is not in these scopes. It waits for the frontend revamp and is listed in the
reconciliation page for reference.

## Open decisions that gate a scope

| Decision | Gates | Recommendation |
|---|---|---|
| Access grid for the 13 roles | CP-3, CP-4 | Nimish approves the grid; technical choice is mine |
| Lowered mapping bars | CP-16 | Amend the roadmap after the full run |
| Staff scope (3 loaded, 7 on the sign-in list) | CP-1 | Load all 7 |
| Sarvam "no retention" in writing | CP-10 | Ask this week; prove CP-9 on the typed form meanwhile |
| Merge #413 (FET) | CP-11 | Merge now |
| One model activity page | CP-15 | Three layouts of one real activity; Nimish picks |
