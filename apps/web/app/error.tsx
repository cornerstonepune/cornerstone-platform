"use client";

import { useEffect } from "react";
import { Card } from "@/components/cards";

// Any page that could not be built — most often because the database did not answer within
// eight seconds (lib/deadline.ts) — says so in words, with a way to try again. It sits at the app's
// root so it also catches the staff check in the section layout, which a nearer error file cannot.
// In production the error's own text never reaches the browser; the reference code matches it to
// the server's log.
export default function PageError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-start justify-center px-5 pt-24">
      <Card as="section" className="w-full max-w-xl" role="alert">
        <h1 className="text-body">This page could not load</h1>
        <div className="grid gap-[var(--space-2)] text-[length:var(--text-label)] leading-relaxed">
          <p>
            The database did not answer in time, the engine is restarting, or the server hit a problem while building
            the page. Nothing you did was lost, and nothing was changed.
          </p>
          <p>Try again in a minute. If it keeps happening, tell Nimish the reference below.</p>
          <div className="flex flex-wrap items-center gap-[var(--space-2)]">
            <button className="btn" type="button" onClick={() => retry()}>
              Try again
            </button>
            {error.digest ? <span className="fact text-[length:var(--text-caption)] text-basalt/55">reference {error.digest}</span> : null}
          </div>
        </div>
      </Card>
    </main>
  );
}
