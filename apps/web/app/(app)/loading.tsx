import { Card } from "@/components/cards";

// What a page shows the moment it is clicked, while its rows are read: the page's own shape in
// grey, so a click is visibly answered. Before this, a click did nothing on screen until the whole
// page arrived — on the live site that was five minutes, and it read as a dead link.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading this page" className="">
      <header className="border-b border-basalt/12 px-5 pt-6 pb-[var(--space-3)] md:px-9">
        <div className="mb-3 h-3 w-24 bg-basalt/10" />
        <div className="h-7 w-72 max-w-full bg-basalt/12" />
        <div className="mt-3 h-3 w-lg max-w-full bg-basalt/8" />
      </header>
      <div className="grid gap-5 px-5 pt-[var(--space-3)] md:px-9">
        {[0, 1, 2].map((n) => (
          <Card as="section" key={n}>
            <div className="h-4 w-48 bg-basalt/10" />
            <div className="h-3 w-full bg-basalt/8" />
            <div className="h-3 w-5/6 bg-basalt/8" />
            <div className="h-3 w-2/3 bg-basalt/8" />
          </Card>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
