"use client";

import { useState } from "react";

interface Props {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * A chip/tag input: type a value and press Enter (or comma) to add it.
 * Backspace on an empty field removes the last chip.
 */
export function TagInput({ values, onChange, placeholder, autoFocus }: Props) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const v = raw.trim().replace(/,$/, "").trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 shadow-sm transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-md bg-blue-500/15 py-1 pl-2 pr-1 text-sm font-medium text-blue-700 dark:text-blue-300"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="grid h-4 w-4 place-items-center rounded text-blue-500/70 transition hover:bg-blue-500/20 hover:text-blue-600"
            aria-label={`Remove ${v}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6 6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}
      <input
        value={draft}
        autoFocus={autoFocus}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={values.length === 0 ? placeholder : "Add another…"}
        className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100"
      />
    </div>
  );
}
