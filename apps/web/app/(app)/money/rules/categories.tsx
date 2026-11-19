"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/icons";

export const CATEGORY_MOST = 60; // letters in a name: the engine refuses more (money_rules.CATEGORY_MOST)

/** What a claim can be for: a list to add to, take from and put in order. Reading it (`editable` off) is the same list without the buttons. */
export function Categories({ names, onChange, editable }: { names: string[]; onChange: (names: string[]) => void; editable: boolean }) {
  const [adding, setAdding] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const kept = useRef<{ row: number; dir: "up" | "down" } | null>(null);

  // after a move the row is in a new place: the button that was pressed is found again so the keyboard carries on from it
  useEffect(() => {
    if (!kept.current) return;
    const { row, dir } = kept.current;
    kept.current = null;
    const [up, down] = Array.from(list.current?.children[row]?.querySelectorAll<HTMLButtonElement>("button[data-move]") ?? []);
    const same = dir === "up" ? up : down;
    (same && !same.disabled ? same : dir === "up" ? down : up)?.focus();
  }, [names]);

  const move = (i: number, by: -1 | 1) => {
    const next = [...names];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    kept.current = { row: i + by, dir: by < 0 ? "up" : "down" };
    onChange(next);
  };
  const add = () => {
    const name = adding.trim();
    if (!name) return;
    if (names.some((x) => x.toLowerCase() === name.toLowerCase())) return setProblem(`“${name}” is already in the list.`);
    setProblem(null);
    setAdding("");
    onChange([...names, name]);
    requestAnimationFrame(() => list.current?.lastElementChild?.scrollIntoView({ block: "nearest" }));
  };

  return (
    <div className="mr-cats-box" data-categories>
      {names.length === 0 ? (
        <p className="mr-note">No category yet. A claim has to be for something, so add at least one.</p>
      ) : (
        <ol ref={list} className={editable ? "mr-cats" : "mr-cats mr-cats-read"} aria-label="Categories">
          {names.map((name, i) => (
            <li key={name} data-category={name}>
              <span className="mr-cat-name">{name}</span>
              {editable ? (
                <>
                  <button type="button" className="mr-icon mr-up" data-move aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <Icon name="following" size={20} />
                  </button>
                  <button type="button" className="mr-icon mr-down" data-move aria-label={`Move ${name} down`} disabled={i === names.length - 1} onClick={() => move(i, 1)}>
                    <Icon name="following" size={20} />
                  </button>
                  <button type="button" className="mr-icon" aria-label={`Remove ${name}`} onClick={() => onChange(names.filter((_, j) => j !== i))}>
                    <Icon name="close" size={20} />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {editable ? (
        <div className="mr-add">
          <label htmlFor="mr-add-category">Add a category</label>
          <div className="mr-add-row">
            <input
              id="mr-add-category"
              value={adding}
              maxLength={CATEGORY_MOST}
              enterKeyHint="done"
              autoComplete="off"
              onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault(); // Enter adds the category; it does not save the rules
                  add();
                }
              }}
            />
            <button type="button" className="btn secondary" onClick={add}>
              Add
            </button>
          </div>
          {problem ? (
            <p className="mr-note" role="status">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
