# PROJECT: <name>

_The locked blueprint. Agents read §1–4 and the current milestone every session. Only Plan sessions edit this file, and every edit gets an ADR in `docs/adr/`. Tasks live in GitHub Issues, not here._

**Status:** <Planning | Building M<N> | Done> · **Current milestone:** M<N> · **Locked on:** <date> · **Version:** <v1, bump on any change>

## 1. Product (≤15 lines)
- **Problem:** <one sentence>
- **Users:** <who, and the one job they hire this for>
- **Must do (v1):** <3–7 bullets — the product in one glance>
- **Will NOT do (v1):** <explicit out-of-scope list — this stops scope creep>
- **Done for v1 means:** <the observable end state>

## 2. Architecture (≤20 lines)
- **Stack:** <language, framework, DB, hosting, auth> — each with a one-line why
- **Shape:** <monolith / services; main modules and what each owns>
- **External systems:** <APIs, data sources, what we call and how often>
- **Multi-tenancy / security model:** <how data is isolated, who can see what>
- **Non-negotiables:** <e.g. every money value is integer paise; every table has tenant_id>

## 3. Data model
- **Source of truth:** `db/schema.sql` (real, runnable schema). Don't copy columns here.
- **Entities and why they exist:**

| Table | Holds | Key relations | Rough rows | Notes |
|---|---|---|---|---|
| <table> | <one line> | <FK → table> | <100 / 1M> | <indexes, soft delete, audit> |

- **Core flows through the data:** <2–4 lines: "an order is created → … → settled">
- **Invariants:** <rules the DB must never break; each one becomes a test>

## 4. Frontend (screens and flows locked here; pixels locked by approved wireframes)
- **Design system:** global kit in `design/tokens.css` + `design/DESIGN.md` (never edited per project). Project brand (the ~20%) lives only in `design/brand.css`, which may override only the tokens listed in `.loop.json → brand_overridable`.
- **Screens:**

| ID | Screen | Who uses it | Job it does | Wireframe | Approved |
|---|---|---|---|---|---|
| S1-<name> | <name> | <user> | <one line> | `design/wireframes/S1-<name>.html` | run `loop status` |

- **Key user flows:** <step lists for the 2–4 flows that matter, by screen ID>
- **Gate:** no frontend code for a screen until Nimish runs `loop approve <ID>`. Editing a wireframe voids its approval.

## 5. Milestones
_M0 is always the data model. Every later milestone is a vertical slice (schema → API → UI → tests) that Nimish can click through and approve. Goals are yes/no; each maps to a test. Tickets come from `/to-tickets` and live in GitHub Issues._

### M0 — Data model · <Not started | In progress | Done>
- **Delivers:** `db/schema.sql` + migrations applied on a fresh DB; every invariant in §3 has a passing test.
- **Goals (yes/no):**
  - [ ] G0.1 Fresh DB migrates with zero errors — test: `<command>`
  - [ ] G0.2 Each §3 invariant is enforced — tests: `<path>`
- **Issues:** <label or milestone link>

### M1 — <name> · <Not started | In progress | Done>
- **Delivers:** <what a user/tester can see or do at the end>
- **Screens:** <S1-…> — wireframes approved before any frontend ticket starts
- **Goals (yes/no):**
  - [ ] G1.1 <check> — test: `<path::test_name>`
  - [ ] G1.2 <check> — test: `<path::test_name>`
- **Issues:** <GitHub milestone link>
- **Out of scope here:** <what waits for a later milestone>
- **Depends on:** M0

### M2 — <name> · Not started
<same shape>

_Completed milestones collapse to one line: `M1 — <name> · Done <date> · PR #<n>`._

## 6. Open questions (Plan resolves before the milestone they block)
- <question> — blocks M<N>
