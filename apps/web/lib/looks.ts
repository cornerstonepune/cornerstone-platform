// How a child's state looks, as the site's own state rows say it (UI-3b). The three growth states are the keys of `STATES`
// (components/status-chip.tsx), named there once: no file here says one in quotes (tests/test_states_and_subject.py). A child's state
// is read by its row's colour alone: green is the first, amber the second, any other seen state the third. Not seen is no row.
import { EMERGING, PRACTISING, SECURE } from "@/components/status-chip";

export { EMERGING, PRACTISING, SECURE };
/** A growth state key of `STATES`. */
export type Look = typeof SECURE;
/** Not a state: a child with no row on the skill. */
export const UNSEEN = "unseen" as const;
export type Bucket = Look | typeof UNSEEN;

/** A state's look from its colour (`child_state.colour`). */
export const lookOfColour = (colour: string): Look => (colour === "green" ? SECURE : colour === "amber" ? PRACTISING : EMERGING);
/** The `STATES` key a bucket is drawn with: the growth states themselves, and "not seen yet". */
export const stateOf = (b: Bucket) => (b === UNSEEN ? ("notSeenYet" as const) : b);
