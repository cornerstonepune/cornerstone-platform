# Wireframes

One file per screen: `<screen-id>.html` (IDs from PROJECT.md §4). Written in Plan sessions.

- Low fidelity: greyscale, layout and content only, real labels and realistic data (Indian number format), every state shown (empty, loading, error, full).
- Uses `../tokens.css` for spacing and type so the build doesn't re-invent layout.
- Open in a browser to review. Approve with `loop approve <screen-id>` in your own terminal.
- Any edit after approval voids it (`loop status` shows STALE). Frontend code for that screen is blocked until re-approved.
