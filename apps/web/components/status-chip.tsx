import { ICON_SIZE, Icon, type IconName } from "@/lib/icons";

// The one chip a state is shown in (docs/ux-rules.md, rule 2 and 9): an icon, the word, and one of red, amber or green,
// from this table alone — never colour by itself. Nimish, 2026-10-22: "use icons or red, amber, green in places that make
// it easier for people to navigate". Red is rare: it means the educator is needed now. `quiet` (grey) is a state with
// nothing to do. A state not in `STATES` is not shown: add it here, with its word and its tone, before a page uses it.
// Blank, wrong and wrong-with-working stay three things (rule 5): three words, three icons.
export type Tone = "ok" | "wait" | "act" | "quiet";
/** A state is its tone (the colour), its words and its icon: a row without an icon does not compile. `look: "unseen"` is
 *  grey on the panel colour with a dashed edge (a child not seen yet). */
export type StateRow = { tone: Tone; words: string; icon: IconName; look?: "unseen" };
export const STATES = {
  right: { tone: "ok", words: "right", icon: "done" },
  done: { tone: "ok", words: "done", icon: "done" },
  wrong: { tone: "wait", words: "wrong", icon: "to-confirm" },
  blank: { tone: "quiet", words: "blank", icon: "to-do" },
  waiting: { tone: "wait", words: "waiting", icon: "to-confirm" },
  spot: { tone: "quiet", words: "spot-check", icon: "to-do" },
  unreadable: { tone: "act", words: "could not read", icon: "fix-this" },
  judge: { tone: "act", words: "for you to judge", icon: "fix-this" },
  toApprove: { tone: "wait", words: "to approve", icon: "to-confirm" },
  withChildren: { tone: "wait", words: "with the children", icon: "to-confirm" },
  toCheck: { tone: "act", words: "to check", icon: "fix-this" },
  toSignOff: { tone: "wait", words: "to sign off", icon: "to-confirm" },
  needsHelp: { tone: "act", words: "needs help", icon: "fix-this" },
  // a child's standing on a topic or a skill, by its colour: always shown in its colour's row's words
  // (`state_colour.count_words`, passed as `words`); these are only the colours' names
  standingGreen: { tone: "ok", words: "green", icon: "done" },
  standingAmber: { tone: "wait", words: "amber", icon: "to-confirm" },
  standingGrey: { tone: "quiet", words: "grey", icon: "to-do" },
  notAssessed: { tone: "quiet", words: "not assessed yet", icon: "to-do" },
  fine: { tone: "ok", words: "doing well", icon: "done" },
  up: { tone: "ok", words: "better", icon: "done" },
  down: { tone: "act", words: "worse", icon: "fix-this" },
  trusted: { tone: "ok", words: "trusted", icon: "done" },
  chooseOne: { tone: "act", words: "choose one", icon: "fix-this" },
  noPaper: { tone: "act", words: "no paper", icon: "fix-this" },
  replaced: { tone: "quiet", words: "replaced by a newer one", icon: "to-do" },
  approved: { tone: "ok", words: "approved", icon: "done" },
  printed: { tone: "ok", words: "printed", icon: "done" },
  taught: { tone: "ok", words: "taught", icon: "done" },
  notTaught: { tone: "quiet", words: "not taught yet", icon: "to-do" },
  doNow: { tone: "act", words: "do now", icon: "fix-this" },
  doSoon: { tone: "wait", words: "this week", icon: "to-confirm" },
  whenReady: { tone: "ok", words: "when ready", icon: "done" },
  teachingNow: { tone: "wait", words: "teaching now", icon: "to-confirm" },
  nextUp: { tone: "quiet", words: "next", icon: "to-do" },
  gettingThere: { tone: "wait", words: "getting there", icon: "to-confirm" },
  noResult: { tone: "quiet", words: "no result yet", icon: "to-do" },
  next: { tone: "wait", words: "next", icon: "to-confirm" },
  notYet: { tone: "quiet", words: "not yet", icon: "to-do" },
  inUse: { tone: "ok", words: "in use", icon: "done" },
  stopped: { tone: "quiet", words: "stopped", icon: "to-do" },
  // the K2 voice notes (task M1-04): a note to confirm, one with a problem, one about an earlier day, a child not named
  toConfirm: { tone: "wait", words: "to confirm", icon: "to-confirm" },
  fixThis: { tone: "act", words: "fix this", icon: "fix-this" },
  late: { tone: "quiet", words: "late", icon: "late" },
  notSeen: { tone: "quiet", words: "not seen", icon: "to-do" },
  toDo: { tone: "quiet", words: "to do", icon: "to-do" },
  reading: { tone: "wait", words: "reading", icon: "to-confirm" },
  // the blocks (UI-2): a child's growth on a skill, a lesson moved, two lessons at once, a day of the class's record
  secure: { tone: "ok", words: "secure", icon: "secure" },
  practising: { tone: "wait", words: "practising", icon: "practising" },
  emerging: { tone: "quiet", words: "emerging", icon: "emerging" },
  notSeenYet: { tone: "quiet", words: "not seen yet", icon: "not-seen", look: "unseen" },
  moved: { tone: "wait", words: "moved", icon: "moved" },
  clash: { tone: "act", words: "clash", icon: "clash" },
  notDone: { tone: "quiet", words: "not done", icon: "to-do" },
  holiday: { tone: "quiet", words: "holiday", icon: "frozen" },
  overdue: { tone: "act", words: "overdue", icon: "late" },
} as const satisfies Record<string, StateRow>;
export type State = keyof typeof STATES;

const GREEN = "text-[var(--state-ok)] bg-[var(--state-ok-bg)] border-[var(--state-ok)]";
const AMBER = "text-[var(--state-wait)] bg-[var(--state-wait-bg)] border-[var(--state-wait)]";
const RED = "text-[var(--state-late)] bg-[var(--state-late-bg)] border-[var(--state-late)]";
const GREY = "text-[var(--state-quiet)] bg-[var(--state-quiet-bg)] border-[var(--state-quiet)]";
export const TONE_CLASS: Record<Tone, string> = { ok: GREEN, wait: AMBER, act: RED, quiet: GREY };

// The chip's colour is a state's tone (the STATES row), its shape the row's icon: every row names its icon, so a state with
// none does not compile. The drawings are in lib/icons.tsx, the one lookup of icons, so a new icon library is one file.
const LOOK: Record<Tone, string> = { ok: "ok", wait: "wait", act: "late", quiet: "quiet" };

/** `round`: a piece of work on the K2 screens (the agreed design: work is a round chip, a child a square cell).
 *  `onTint`: the chip sits on a tinted cell or square (a subject's, a child's): the fill is the panel colour with the 1 px
 *  ring in the state's colour, because a state's fill and a subject's fill can be within 5 of each other (CIE76). */
export function StatusChip({ state, note, words, compact, round, onTint }: { state: State; note?: string; words?: string; compact?: boolean; round?: boolean; onTint?: boolean }) {
  const s: StateRow = STATES[state];
  const unseen = s.look === "unseen";
  const fill = onTint || unseen ? "!bg-[var(--panel)]" : "";
  return (
    <span
      data-block="StatusChip"
      data-status={state}
      data-tone={s.tone}
      data-state={unseen ? "unseen" : LOOK[s.tone]}
      data-on-tint={onTint ? "" : undefined}
      className={`inline-flex items-center border py-[3px] whitespace-nowrap ${round ? "rounded-full" : ""} ${unseen ? "border-dashed" : ""} ${fill} ${compact ? "gap-[4px] px-[6px] text-[11.5px]" : "gap-[5px] px-[9px] text-[12px]"} ${TONE_CLASS[s.tone]}`}
    >
      <Icon name={s.icon} size={ICON_SIZE.table} />
      {words ?? s.words}
      {note ? ` · ${note}` : ""}
    </span>
  );
}
