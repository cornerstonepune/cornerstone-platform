VERDICT: PASS

Independent check of UI-1 ("The test harness"), branch ui-1-tokens-frame-inventory at 8b4a2cf1, against origin/main. specs/UI-1/design-review and docs/frontend left out, as asked. (Second review; the first, at bdcb5c8a, returned FAIL for shadcn's unlayered `--border` overriding the school's border colour. The builder removed it in 8b4a2cf1 and this review re-checked it.)

`python3 .claude/athena/bin/athena done UI-1` output (this session):
```
UI-1: PASS
  pass  1 @axe-core/playwright is an apps/web dependency and the journey runs axe on every page it visits
  pass  2 e2e/athena-journey.ts exists; a journey spec imports it, signs in, opens an existing page and passes; ui-ready UI-1
  pass  3 shadcn/ui initialised (components.json); components/ui holds only the stock Button and Tabs
  pass  4 bin/check, test_ux_rules.py, u51 and screens.spec.ts pass; ux.frozen has not grown since main
ALL DONE (1/1 specs pass)
```
There is no node_modules and no TEST_DATABASE_URL in the verifier's container, so proofs 1, 2 and 4 took the no-browser path (specs/UI-1/proofs/harness.py:168-174, 209-212, 295-299). In proof 4, bin/check, test_ux_rules.py and the ux.frozen check did run for real. The browser runs of the journey, u51 and screens.spec.ts rest on the builder's report (38 passed, full run, bdcb5c8a and 8b4a2cf1: `athena done UI-1` 4/4 with a browser, journey-check and baseline-check exit 0) and on CI.

Other commands run: `athena journey-check --base origin/main` exit 0. `athena ui-ready UI-1` exit 0. `athena baseline-check --base origin/main --body-file /dev/null` exit 0 (no PR body there, so run again on the real PR). `git diff --name-status origin/main...HEAD -- apps/web/tests apps/web/app/layout.tsx workflows.json` returned nothing.

## 1. Criteria
1. **MET.** `@axe-core/playwright ^4.14.0` is a devDependency (apps/web/package.json). `step()` runs `new AxeBuilder({page}).analyze()` on every page the journey opens and attaches the findings to the report (apps/web/e2e/athena-journey.ts:13-19). Proof 1 passes.
2. **MET.** apps/web/e2e/athena-journey.ts exists. apps/web/e2e/sign-in-and-open.spec.ts:1-5 imports it and opens /today, checking the heading "What needs doing" (app/(app)/today/page.tsx:103). It signs in with the existing SIGNED_IN session through the new "journey" project (apps/web/playwright.config.ts:55-56); no login path of its own. `athena ui-ready UI-1` exits 0. Proof 2 passes.
3. **MET.** apps/web/components.json is shadcn's file. components/ui holds only button.tsx and tabs.tsx, both stock: no colour literals, stock variants (proof 3). apps/web/lib/utils.ts is exactly the standard shadcn `cn` (`twMerge(clsx(inputs))`). Button and Tabs are not used yet, which the spec allows.
4. **MET.** Proof 4 passes: ux.frozen has not grown, bin/check and test_ux_rules.py pass. The u51 and screens.spec.ts browser runs were not run in the verifier's container.

## Can any existing page look different? (adversarial check)
**(a) What globals.css adds compared with origin/main:**
- Imports: `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"` (lines 5-6).
- Dark variant: `@custom-variant dark (&:is(.dark *))` (line 8).
- Variables on the unlayered :root: --background, --foreground, --card(-foreground), --popover(-foreground), --primary/-foreground, --secondary/-foreground, --muted/-foreground, --accent/-foreground, --destructive, --input, --ring, --chart-1..5 and --sidebar* (lines 30-59).
- `@theme inline`: 31 `--color-*` mappings (lines 74-104), including `--color-border: var(--border)`.
- A `.dark { … }` block at lines 484-514.
- No base, element or `*` rules were added. The html, body and @layer base blocks (lines 107, 111, 130, 141) are unchanged from main. The `--border` line from the earlier review is gone: the only `--border` left in globals.css is the `--color-border` mapping at line 89.

Name collisions:
- None of the added variable names is declared or used anywhere else in apps/web (every .ts, .tsx and .css file outside components/ui grepped). design-system/tokens.css declares only --brand-*, --bg, --surface, --text*, --border*, --focus, chips, space, radius and font names, none of which overlap.
- The only names the new mappings share with existing code are `--color-border → var(--border)` and the colour utilities it creates. Inside SchoolShell (school-tokens.css, layer tokens), and on timetable/rules/page.tsx:7 which imports tokens.css unlayered, `--border` resolves to the school's #d9d6ce (dark: #3a3832). Everywhere else it is undefined. It does not matter on today's pages, because no existing code uses `border-border`, `bg-background`, `text-foreground`, `ring-ring`, `bg-primary`, `text-muted-foreground` or any other new colour utility (zero hits outside components/ui).
- Tailwind v4 preflight does not read `--color-border` or `--color-ring`.
- No existing code uses a `dark:` utility or a `.dark` class, so the new dark variant and the `.dark` block cannot apply.

**(b) The two imported packages**, read from the lockfile-pinned registry tarballs (shadcn 4.23.0, tw-animate-css 1.4.0):
- tw-animate-css: only @property declarations, @keyframes, one `@theme inline` adding new `--animate-*` names (none of Tailwind's defaults overridden), and @utility rules. No base or element rules. Its `delay-*` utility would add `animation-delay` to Tailwind's `delay-N` classes, but no existing code uses `delay-N`.
- shadcn/tailwind.css: @keyframes inside @theme, @custom-variants (data-open, closed, checked, unchecked, selected, disabled, active, horizontal, vertical), @utility rules (no-scrollbar, scroll-fade*, shimmer*) and @property declarations. Its one unlayered rule is `@media (prefers-reduced-motion: reduce) { .shimmer {…} }`.
- Existing usage of any of these: none. The only near-miss is `cursor-zoom-in` in capture/check/zoom-page.tsx:16, which Tailwind reads as a different class.

**(c)** layout.tsx is unchanged.

**Conclusion:** nothing found that can change the look of any existing page.

**(d) Other checks:**
- Every added dependency is used: cva and radix-ui by button.tsx and tabs.tsx; clsx and tailwind-merge by lib/utils.ts; tw-animate-css and shadcn by the globals.css imports; axe by the journey.
- The axe findings are not dropped. Each step attaches them to the report, and a step fails on them only when called with strict=true. docs/notes/UI-1.md records today's findings on /today (colour contrast, nested interactive controls) and that they are left for UI-14.
- The lockfile matches package.json: same dependencies at root, every new package resolves to its pinned version. It adds 241 packages and removes none.

## 2. Unasked work
Nothing of substance.
- The `.dark` block, the chart and sidebar variables and `@custom-variant dark` are what stock `shadcn init` writes, and the spec says "the stock look is left as installed". They are dead weight until UI-14.
- docs/notes/UI-1.md is required by the repo's rules (a branch note at each commit).
- The lockfile also bumps 12 packages the new ones depend on (@babel/*, axe-core, browserslist, caniuse-lite, electron-to-chromium, node-releases, update-browserslist-db, baseline-browser-mapping). A side effect of `npm install`. No direct dependency changed version: next, react, tailwindcss and playwright are the same as on main.

## 3. Missing
Nothing the spec promised is absent. Button and Tabs are installed, the journey and axe are in place, and no other primitive was added.

## 4. Risks
No secrets, no real client data, no database or migration change, no authentication or permission change. The journey uses the existing test session against the local copy of the database, which playwright.config.ts:19-23 enforces.

Not checked by the verifier: the full browser runs (the journey, u51, screens.spec.ts and the screenshot baselines) did not run in its container, because there is no node_modules, test database or Chromium. CI's web job has to confirm them. baseline-check was not run with the real PR body.
