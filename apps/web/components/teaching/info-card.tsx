import { ICON_SIZE, Icon, type IconName } from "@/lib/icons";

// The panels of the teaching screens (UI-3c): a white card whose header is a small icon and a title (the wireframe's `card`), and the
// row of tiles it sometimes holds. A card that names a kind of thing (an objective, a skill) is `Cards`; this is the plain one.
export function InfoCard({ icon, title, children, id, label }: { icon: IconName; title: React.ReactNode; children: React.ReactNode; id?: string; label?: string }) {
  return (
    <section className="b-card" id={id} aria-label={label}>
      <div className="b-card-h">
        <Icon name={icon} size={ICON_SIZE.table} />
        <h2 className="m-0 text-[length:var(--text-body)] font-semibold">{title}</h2>
      </div>
      <div className="b-card-b">{children}</div>
    </section>
  );
}

/** A row of tiles, each a small label over a value (the wireframe's `kv cells`). */
export function Tiles({ tiles, label }: { tiles: readonly { label: string; value: React.ReactNode }[]; label: string }) {
  return (
    <dl aria-label={label} className="m-0 grid grid-cols-1 gap-[var(--space-2)] min-[600px]:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-[var(--radius-card)] bg-[var(--surface)] p-[var(--space-3)]">
          <dt className="text-[length:var(--text-label)] text-[var(--ink-muted)]">{t.label}</dt>
          <dd className="m-0 text-[length:var(--text-title-small)]">{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}
