# Handoff — new live address (plan/new-address)

**Updated:** 2026-11-28 · **Model:** claude-opus-5-5

- Live site is https://console.cornerstoneschool.in; the old https://cornerstone-assessment.vercel.app answers 307 to it.
- Checked 2026-11-28: new `/login` → 200; old `/login` → 307 to the new `/login`.
- Changed: `watch-live.yml` WEB, plus the live address, redeploy command (`--scope cornerstone-school`) and Vercel team note in `docs/deploy.md`.
- Left alone on purpose: dated history (STATE.md, docs/notes, docs/loop/adopt-survey-product.md).
- Not merged: Nimish asked to be asked before any merge or release.
- Unverified: the `vercel redeploy` command with the custom domain and `--scope` was not run (it would deploy).
