import Link from "@/components/link";
import { Body, PageHeader } from "@/components/parts";

/** What a person reads for a Money or Stock screen they may not use: that it is not theirs, who it is for, and nothing of it (the site's not-yours page, in the screen's words). */
export function NotForYou({ stage, title, who, back }: { stage: string; title: string; who: string; back: { href: string; label: string } }) {
  return (
    <>
      <PageHeader stage={stage} title="Not for you" sub={`${title} is for ${who}.`} />
      <Body>
        <p className="max-w-[62ch]" role="status">
          {title} is not one of your pages. Nothing was shown or changed.
        </p>
        <p className="mt-3">
          <Link href={back.href} className="underline underline-offset-2">
            {back.label}
          </Link>
        </p>
      </Body>
    </>
  );
}
