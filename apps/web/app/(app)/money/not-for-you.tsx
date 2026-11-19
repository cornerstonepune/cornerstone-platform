import Link from "@/components/link";
import { Body, PageHeader } from "@/components/parts";

/** What a person reads for a Money screen they may not use: that it is not theirs, who it is for, and nothing of it (the site's not-yours page, in Money's words). */
export function NotForYou({ title, who }: { title: string; who: string }) {
  return (
    <>
      <PageHeader stage="Money" title="Not for you" sub={`${title} is for ${who}.`} />
      <Body>
        <p className="max-w-[62ch]" role="status">
          {title} is not one of your pages. Nothing was shown or changed.
        </p>
        <p className="mt-3">
          <Link href="/money" className="underline underline-offset-2">
            Back to My claims
          </Link>
        </p>
      </Body>
    </>
  );
}
