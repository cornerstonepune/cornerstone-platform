// "n to do" said one way (CP-68). CountChip: a whole number and its words in a quiet chip; `tone` "act" when it needs her (the accent as a
// wash), "done" when nothing is left. Meter: how far along, as a small bar with its figures beside it, and its value said to a screen reader.
// Whole counts only: a figure that is not a whole count is the page's mistake, and fails loudly here.
const whole = (n: number, what: string) => {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`${what} counts whole things, not ${n}`);
  return n;
};
const say = (n: number) => n.toLocaleString("en-IN");

export function CountChip({ n, words, tone }: { n: number; words: string; tone?: "act" | "done" }) {
  whole(n, "a count chip");
  return (
    <span data-block="CountChip" data-tone={tone} className="b-nchipc">
      <b>{say(n)}</b> {words}
    </span>
  );
}

/** `done` of `of`, drawn as a bar; `label` says what is counted ("papers checked"). Nothing to count draws nothing. */
export function Meter({ done, of, label }: { done: number; of: number; label: string }) {
  whole(done, "a meter");
  whole(of, "a meter");
  if (of === 0) return null;
  const at = Math.min(done, of);
  return (
    <span data-block="Meter" className="b-meter" data-done={at === of ? "" : undefined}>
      <span className="b-meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={of} aria-valuenow={at} aria-valuetext={`${say(at)} of ${say(of)} ${label}`}>
        <span className="b-meter-fill" style={{ "--share": at / of } as React.CSSProperties} />
      </span>
      <span className="b-meter-n" aria-hidden="true">
        {say(at)} of {say(of)}
      </span>
    </span>
  );
}
