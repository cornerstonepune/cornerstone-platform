import type { ReactNode } from "react";
import { Screen } from "@/components/app-frame";
import { EmptyState } from "@/components/empty-state";
import { NotForYou } from "@/components/not-for-you";
import type { Session } from "@/lib/auth";
import { campusOf, stockAccess } from "@/lib/stock-access";
import type { Reasons } from "@/lib/stock-words";

// Who a Stock page is for: a person who keeps a store (the engine says which campuses). Everyone else reads that it is not theirs and sees nothing of it; when the
// engine cannot say, the page says that, in words, instead of calling a keeper a stranger.
export type Keeper = { me: Session; kept: string[]; campus: string; reasons: Reasons };

export async function keeper(me: Session, title: string, purpose: string, asked: string | undefined): Promise<Keeper | { refused: ReactNode }> {
  const access = await stockAccess(me.email);
  const kept = access?.campuses;
  if (kept && !kept.length) return { refused: <NotForYou stage="Stock" title={title} who="operations leads and the founders" back={{ href: "/my-day", label: "Back to My day" }} /> };
  if (!kept)
    return {
      refused: (
        <Screen stage="Stock" title={title} purpose={purpose} next={{ href: "/my-day", label: "My day" }}>
          <EmptyState>The store could not be read just now. Try again in a minute.</EmptyState>
        </Screen>
      ),
    };
  return { me, kept, campus: campusOf(kept, asked), reasons: access?.reasons ?? { count: [], writeoff: [] } };
}
