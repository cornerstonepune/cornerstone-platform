// One quiet notice for the K2 pages: a refusal or an empty state, said once. Monsoon (the school's "coming up"), not green,
// which reads as done: nothing here is done or wrong (a child not seen is only not seen). Tokens only.
export function Notice({ children, flush }: { children: React.ReactNode; flush?: boolean }) {
  return (
    <p
      role="status"
      data-ux="empty"
      className={`${flush ? "" : "mb-[var(--space-3)] "}rounded-[var(--radius-control)] border p-[var(--space-3)] text-[length:var(--text-body)]`}
      style={{ color: "var(--state-quiet)", background: "var(--state-quiet-bg)", borderColor: "var(--state-quiet)" }}
    >
      {children}
    </p>
  );
}
