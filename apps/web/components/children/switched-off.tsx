import { Screen } from "@/components/app-frame";
import { EmptyState } from "@/components/empty-state";
import { SWITCHED_OFF } from "@/lib/children-reads";

/** What a Children screen says while the educator switch is off: the reason, a way on, and no child. */
export function SwitchedOff({ title, stage }: { title: string; stage: string }) {
  return (
    <Screen stage={stage} title={title} purpose="Children appear once the school switches the educator screens on." action={<span />} next={{ href: "/my-day", label: "Today" }}>
      <EmptyState>{SWITCHED_OFF}</EmptyState>
    </Screen>
  );
}
