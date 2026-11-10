import Link from "@/components/link";
import { Details } from "@/components/details";
import { Screen } from "@/components/app-frame";
import { requireStaff } from "@/lib/auth";
import { mayUse } from "@/lib/access";
import { BLOCKS } from "@/lib/blocks";
import { notFound } from "next/navigation";
import { Legend } from "./legend";
import { sampleOf } from "./samples";

type Props = { searchParams: Promise<Record<string, string | undefined>> };

// The blocks (UI-2, docs/frontend/screens.json `blocks`): every part the site is built from, on sample data that lives in
// this page, never in a database row. The legend first, then one fold per block, closed unless the address names it
// (?open=Name, so a link from inside a sample, or a filter, lands with its fold open). For the coordinator; absent for
// anyone else, and linked only from Setup's details.
export default async function BlocksPage({ searchParams }: Props) {
  const me = await requireStaff();
  if (!mayUse(me, "blocks")) notFound();
  const q = await searchParams;
  const first = BLOCKS[0].name;
  return (
    <Screen
      stage="Setup · for the people who build the site"
      title="The blocks"
      purpose="Every part the site is built from, with sample data and its words. Open one to see how it behaves."
      action={
        <Link href={`/setup/blocks?open=${first}#fold-${first}`} className="b-btn b-btn-main" data-main>
          Open the first block
        </Link>
      }
      next={{ href: "/", label: "Setup" }}
    >
      <div className="b-gallery">
        <Legend />
        <section aria-label="The blocks, one fold each" className="b-folds" style={{ display: "grid", gap: "var(--space-3)" }}>
          {BLOCKS.map((b) => {
            const sample = sampleOf(b.name, q, me);
            return (
              <Details key={b.name} name={b.name} id={`fold-${b.name}`} open={q.open === b.name} summary={b.name}>
                <p className="b-muted">{b.contract}</p>
                <div data-sample={b.name} className="b-sample">
                  {sample ?? <p data-no-sample>No sample yet: {b.name} is built in UI-13.</p>}
                </div>
              </Details>
            );
          })}
        </section>
      </div>
    </Screen>
  );
}
