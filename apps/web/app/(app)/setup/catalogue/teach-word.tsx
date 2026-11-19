"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CommonWord } from "@/lib/catalogue-words";
import { teachWord } from "./actions";

// "Teach a word" (CP-84b): a word the items with no category end in, and the category it files under. Every such item takes it at once, and the word is kept, so the
// next fill reads it too. The words offered are the commonest of the items with no category; what the engine says is shown as it says it.
export function TeachWord({ words, categories }: { words: readonly CommonWord[]; categories: readonly string[] }) {
  const [word, setWord] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(null);
    start(async () => {
      const r = await teachWord(word, category);
      if (!r.ok) return setError(r.error);
      setError(null);
      setDone(`${r.items_set} ${r.items_set === 1 ? "item" : "items"} set to ${r.category}. “${r.word}” files there from now on.`);
      setWord("");
      router.refresh();
    });
  };
  return (
    <details data-teach className="min-w-0">
      <summary className="btn secondary w-fit cursor-pointer">Teach a word</summary>
      <form onSubmit={send} noValidate className="b-form mt-[var(--space-2)]">
        <p className="b-muted">Items with no category that end in this word will take it.</p>
        {error ? (
          <p role="alert" data-error className="text-[var(--state-late)] [overflow-wrap:anywhere]">
            {error}
          </p>
        ) : null}
        <div className="b-field" data-field="word">
          <label htmlFor="teach-word">Word</label>
          <select id="teach-word" value={word} onChange={(e) => setWord(e.target.value)}>
            <option value="">Choose a word</option>
            {words.map((w) => (
              <option key={w.word} value={w.word}>
                {w.word} ({w.items} {w.items === 1 ? "item" : "items"})
              </option>
            ))}
          </select>
        </div>
        <div className="b-field" data-field="category">
          <label htmlFor="teach-category">Category</label>
          <select id="teach-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose a category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button type="submit" className="btn w-full min-[701px]:w-auto" disabled={pending || !word || !category} aria-busy={pending}>
            {pending ? "Teaching…" : "Teach the word"}
          </button>
        </div>
        {done ? (
          <p role="status" data-taught className="font-semibold">
            {done}
          </p>
        ) : null}
      </form>
    </details>
  );
}
