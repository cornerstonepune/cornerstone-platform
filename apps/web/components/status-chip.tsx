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
// A child's growth on a skill is drawn by a tree, a leaf and a sprout. The school's words for it are the engine's rows
// (`child_state`, read by lib/states.ts), so no page types them: a row's key here is the state's own code and its words
// are that key, never a second copy (test_states_and_subject.py).
const GROWTH = { secure: 0, practising: 0, emerging: 0 };
type Growth = keyof typeof GROWTH;
const SAYS = Object.fromEntries(Object.keys(GROWTH).map((k) => [k, k])) as { [K in Growth]: K };
/** The growth states, in the order the blocks draw them (strongest first). */
export const [SECURE, PRACTISING, EMERGING] = Object.keys(GROWTH) as [Growth, Growth, Growth];
// A different shape for each tone, so a chip reads without its colour: a tick, a clock, a triangle with a mark, a ring.
// A row takes its tone's shape unless it has a drawing of its own; the drawings are in lib/icons.tsx, the one lookup of icons.
const STATUS_ICONS = { ok: "done", wait: "to-confirm", act: "fix-this", quiet: "to-do" } as const satisfies Record<Tone, IconName>;
export const STATES = {
  right: { tone: "ok", words: "right", icon: STATUS_ICONS.ok },
  done: { tone: "ok", words: "done", icon: STATUS_ICONS.ok },
  wrong: { tone: "wait", words: "wrong", icon: STATUS_ICONS.wait },
  blank: { tone: "quiet", words: "blank", icon: STATUS_ICONS.quiet },
  waiting: { tone: "wait", words: "waiting", icon: STATUS_ICONS.wait },
  spot: { tone: "quiet", words: "spot-check", icon: STATUS_ICONS.quiet },
  unreadable: { tone: "act", words: "could not read", icon: STATUS_ICONS.act },
  judge: { tone: "act", words: "for you to judge", icon: STATUS_ICONS.act },
  toApprove: { tone: "wait", words: "to approve", icon: STATUS_ICONS.wait },
  withChildren: { tone: "wait", words: "with the children", icon: STATUS_ICONS.wait },
  toCheck: { tone: "act", words: "to check", icon: STATUS_ICONS.act },
  toSignOff: { tone: "wait", words: "to sign off", icon: STATUS_ICONS.wait },
  needsHelp: { tone: "act", words: "needs help", icon: STATUS_ICONS.act },
  // a child's standing on a topic or a skill, by its colour: always shown in its colour's row's words
  // (`count_words` of the setting `state.colours`, passed as `words`); these are only the colours' names
  standingGreen: { tone: "ok", words: "green", icon: STATUS_ICONS.ok },
  standingAmber: { tone: "wait", words: "amber", icon: STATUS_ICONS.wait },
  standingGrey: { tone: "quiet", words: "grey", icon: STATUS_ICONS.quiet },
  notAssessed: { tone: "quiet", words: "not assessed yet", icon: STATUS_ICONS.quiet },
  fine: { tone: "ok", words: "doing well", icon: STATUS_ICONS.ok },
  up: { tone: "ok", words: "better", icon: STATUS_ICONS.ok },
  down: { tone: "act", words: "worse", icon: STATUS_ICONS.act },
  trusted: { tone: "ok", words: "trusted", icon: STATUS_ICONS.ok },
  chooseOne: { tone: "act", words: "choose one", icon: STATUS_ICONS.act },
  noPaper: { tone: "act", words: "no paper", icon: STATUS_ICONS.act },
  replaced: { tone: "quiet", words: "replaced by a newer one", icon: STATUS_ICONS.quiet },
  approved: { tone: "ok", words: "approved", icon: STATUS_ICONS.ok },
  printed: { tone: "ok", words: "printed", icon: STATUS_ICONS.ok },
  taught: { tone: "ok", words: "taught", icon: STATUS_ICONS.ok },
  notTaught: { tone: "quiet", words: "not taught yet", icon: STATUS_ICONS.quiet },
  doNow: { tone: "act", words: "do now", icon: STATUS_ICONS.act },
  doSoon: { tone: "wait", words: "this week", icon: STATUS_ICONS.wait },
  whenReady: { tone: "ok", words: "when ready", icon: STATUS_ICONS.ok },
  teachingNow: { tone: "wait", words: "teaching now", icon: STATUS_ICONS.wait },
  nextUp: { tone: "quiet", words: "next", icon: STATUS_ICONS.quiet },
  gettingThere: { tone: "wait", words: "getting there", icon: STATUS_ICONS.wait },
  noResult: { tone: "quiet", words: "no result yet", icon: STATUS_ICONS.quiet },
  next: { tone: "wait", words: "next", icon: STATUS_ICONS.wait },
  notYet: { tone: "quiet", words: "not yet", icon: STATUS_ICONS.quiet },
  inUse: { tone: "ok", words: "in use", icon: STATUS_ICONS.ok },
  stopped: { tone: "quiet", words: "stopped", icon: STATUS_ICONS.quiet },
  // the K2 voice notes (task M1-04): a note to confirm, one with a problem, one about an earlier day, a child not named
  toConfirm: { tone: "wait", words: "to confirm", icon: STATUS_ICONS.wait },
  fixThis: { tone: "act", words: "fix this", icon: STATUS_ICONS.act },
  late: { tone: "quiet", words: "late", icon: "late" },
  notSeen: { tone: "quiet", words: "not seen", icon: STATUS_ICONS.quiet },
  toDo: { tone: "quiet", words: "to do", icon: STATUS_ICONS.quiet },
  reading: { tone: "wait", words: "reading", icon: STATUS_ICONS.wait },
  // the blocks (UI-2): a child's growth on a skill, a lesson moved, two lessons at once, a day of the class's record
  secure: { tone: "ok", words: SAYS.secure, icon: "tree" },
  practising: { tone: "wait", words: SAYS.practising, icon: "leaf" },
  emerging: { tone: "quiet", words: SAYS.emerging, icon: "sprout" },
  notSeenYet: { tone: "quiet", words: "not seen yet", icon: "not-seen", look: "unseen" },
  moved: { tone: "wait", words: "moved", icon: "moved" },
  clash: { tone: "act", words: "clash", icon: "clash" },
  notDone: { tone: "quiet", words: "not done", icon: STATUS_ICONS.quiet },
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
