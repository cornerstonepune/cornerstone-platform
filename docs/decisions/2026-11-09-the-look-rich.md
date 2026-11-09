# The site's look: the rich variant (B)

Date: 9 Nov 2026. Decided by Nimish, from the clickable draft "Cornerstone look draft" (private artifact
https://claude.ai/code/artifact/18a01d88-46c0-4932-8aaa-696c4053e4fb), relayed by the Frontend orchestrator.

## Decision

Nimish: "Go with B trimmed - presuming B trimmed is still the version that you're showing me here as B rich, right?
Because this is exactly what I want. Whatever is coming out in the B rich, that's the one I want." The orchestrator took
the last sentence as the decision: the system exactly as drawn in B.

- One colour means one thing, in four families that never share a meaning: work states (red, amber, green, grey, always
  with icon and word), seven kinds of thing each with its icon (period slate, child teal, activity indigo, objective
  violet, skill orchid, assessment sky, note stone), three subjects (Numeracy blue, Language brown, Arts gold) and the
  neutrals.
- Rounded shapes with a meaning each: 14 px cards, 10 px controls, pills for states and counts. One soft card shadow
  instead of borders. Press feedback is the only motion.
- The child's page leads with a graph of the skills seen around the child, with a table beside it and a list on a phone.
- On a phone the four doors are a bottom tab bar.

The values are in `docs/frontend/tokens.json` (version 2) and the rules in `docs/frontend/spec-head.md` §3.

## Changed after the draft, by measurement

Two colours moved slightly so that no two meanings sit closer than 20 (CIE76): Language from `#8b4a2b` to `#87402f` (it was
18 from the wait amber in light) and the dark-theme wait amber from `#f5b94a` to `#ff9f43` (it was 6 from the Arts gold in
dark). The Arts and amber tints, and the Language and red tints, stay close (about 3 and 5); a state chip on a tinted cell
therefore sits on the panel colour with a ring.

## Rejected

- **A, the calm specification**: square corners, no shadow, colour rationed to states. Nimish found it too plain:
  "simplicity cannot come in the way of making the right UI/UX, which is attractive and powerful enough."
- **B trimmed** (the session's recommendation): three kind families instead of seven, and a faint ring instead of the soft
  shadow. Rejected by Nimish's choice of B as drawn. The risk it addressed stays: seven kind colours plus three subjects plus
  four states are many to learn; the icon and the word on every one of them is what keeps the colours from having to be
  memorised.

## Supersedes

The square-corner and no-shadow rules of the first specification, the "colour is rationed" rule, and the subject values in
`2026-11-09-site-type-and-subject-colours.md` (the subjects keep their materials' families, in stronger values). The type
decision in that file stands.
