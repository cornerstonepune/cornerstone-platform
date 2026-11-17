# Papers to assess: the cards keep a scale gap (main red, 17 Nov)

## Verified

- CI run 44085688316 on f0608e4: u90 "/today: cards never touch and keep a scale gap" failed at 1440 and 400 px ("0.0px between card …
  and card …"). It passed on #843's head because the shared database held at most one paper waiting; on main, other core tests had
  seeded more, and the Papers block (`app/(app)/today/blocks.tsx`) is a `<ul class="grid">` of cards with no gap.
- Fix: the list takes `gap-[var(--space-2)]` (12 px, the scale step the Waiting list already uses).
- `npx playwright test u90-design-system -g "/today"` on the local copy: 10 passed. The local copy has no papers waiting, so the red
  itself was not reproduced here; the cause is read from the code and the failure text.
