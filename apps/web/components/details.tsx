import { ICON_SIZE, Icon } from "@/lib/icons";

/** A fold that opens on click, with the eye icon. A native <details>: it never hides the page's main action. */
export function Details({ summary, children, open, id, name }: { summary: React.ReactNode; children: React.ReactNode; open?: boolean; id?: string; name?: string }) {
  return (
    <details data-block="Details" className="b-details" open={open} id={id} data-fold={name}>
      <summary>
        <Icon name="details" size={ICON_SIZE.table} />
        {summary}
      </summary>
      <div>{children}</div>
    </details>
  );
}
