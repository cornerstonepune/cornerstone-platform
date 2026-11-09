---
name: athena-unlock-amendment
category: verification
description: Use when Nimish types UNLOCK on a locked Athena spec.
---

# Unlock amendments: change only what was unlocked, then prove each spec alone

Change only the check Nimish's UNLOCK names. Every other line of spec.md, checks.sh and proofs/ stays byte-identical to the lock.

1. Make the amended proof undo exactly the allowed edit and compare the rest with main byte for byte. A proof that only asks "was the file changed" blocks the very change it was amended to allow.
2. Relock with `athena lock` before running anything.
3. Run `athena done` one spec at a time and read each result.
4. Write the reason and the known gap (what the amended proof does not catch) in `docs/notes/` under the spec ID.
5. Push once, then tell the orchestrator the SHA.
