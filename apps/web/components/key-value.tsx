/** Facts as label: value pairs, five lines at most. */
export function KeyValue({ rows }: { rows: readonly { label: string; value: React.ReactNode; num?: boolean }[] }) {
  return (
    <dl data-block="KeyValue" className="b-kv">
      {rows.slice(0, 5).flatMap((r) => [
        <dt key={`${r.label}-t`}>{r.label}</dt>,
        <dd key={`${r.label}-d`} className={r.num ? "b-num" : undefined}>{r.value}</dd>,
      ])}
    </dl>
  );
}
