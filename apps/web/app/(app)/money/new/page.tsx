import { Screen } from "@/components/app-frame";
import { EmptyState } from "@/components/empty-state";
import { requireStaff } from "@/lib/auth";
import { claimForm, myClaims } from "@/lib/money-claims";
import { ClaimForm } from "./claim-form";

// File a claim (CP-80): a phone-gate screen, a photographed bill being the common case. `?from=<claim id>` opens it with a sent-back claim's
// fields filled in (File it again): the person puts right what was wrong and files it as a new claim.
export default async function NewClaim({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireStaff();
  const { from } = await searchParams;
  const [form, claims] = await Promise.all([claimForm(me), from ? myClaims(me) : null]);
  const again = from ? claims?.find((c) => c.id === from && c.status === "sent back") : undefined;
  return (
    <Screen stage="Money" title="File a claim" purpose="Add the bill and say what it was for." next={{ href: "/money", label: "Back to My claims" }}>
      {form ? (
        <ClaimForm
          categories={form.categories}
          subcategories={form.subcategories}
          campuses={form.campuses}
          today={form.today}
          from={again?.id ?? null}
          start={{
            amount: again ? Number(again.amount).toFixed(2) : "",
            spent_on: again?.spent_on ?? form.today,
            vendor: again?.vendor ?? "",
            category: again?.category ?? "",
            subcategory: again?.subcategory ?? "",
            campus: again?.campus && form.campuses.includes(again.campus) ? again.campus : form.campuses.length === 1 ? form.campuses[0] : "",
            note: "",
          }}
        />
      ) : (
        <EmptyState next={{ href: "/money", label: "Back to My claims" }}>The form could not be opened just now. Try again in a minute.</EmptyState>
      )}
    </Screen>
  );
}
