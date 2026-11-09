# UI-1 is blocked

When: 2026-11-09T10:16:59+00:00

## Why, in plain words

specs/UI-1/proofs/watch.cjs reads process.env.TEST_WORKER_INDEX once when it loads (const inWorker), but Playwright 1.63 sets it in the worker only after --require modules have loaded (seen: load idx=undefined, later @playwright/test requested with idx=0). So inWorker is always false, the watcher records nothing, and proofs 1 and 2 fail 'axe never ran' / 'opened no existing page' wherever the browser run is possible (CI web job too). With TEST_WORKER_INDEX=0 preset in the shell all four proofs pass (diagnostic only). Fix: read TEST_WORKER_INDEX inside Module._load, not at load.

## What Nimish needs to decide

Read the reason above. Then either clarify the scope in the GitHub issue, or type `UNLOCK UI-1` in a Claude session to change the proofs, or close the issue.

## Last proof run

```
UI-1: PASS
  pass  1 @axe-core/playwright is an apps/web dependency and the journey runs axe on every page it visits
  pass  2 e2e/athena-journey.ts exists; a journey spec imports it, signs in, opens an existing page and passes; ui-ready UI-1
  pass  3 shadcn/ui initialised (components.json); components/ui holds only the stock Button and Tabs
  pass  4 bin/check, test_ux_rules.py, u51 and screens.spec.ts pass; ux.frozen has not grown since main
```
