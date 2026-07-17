"use client";

import { useState } from "react";
import type { Reminder, ReminderSeverity } from "@/lib/insights";
import { cn } from "@/lib/utils";

const SEV_STYLE: Record<
  ReminderSeverity,
  { dot: string; text: string; ring: string }
> = {
  urgent: {
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-300",
    ring: "hover:border-rose-400/50",
  },
  warn: {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-300",
    ring: "hover:border-amber-400/50",
  },
  info: {
    dot: "bg-blue-500",
    text: "text-blue-600 dark:text-blue-300",
    ring: "hover:border-blue-400/50",
  },
};

interface Props {
  reminders: Reminder[];
  onSelect: (appId: string) => void;
}

export function RemindersPanel({ reminders, onSelect }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (reminders.length === 0) {
    return (
      <div className="animate-fade-in-up rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 dark:border-emerald-500/20">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/15">
            ✓
          </span>
          You&rsquo;re all caught up — no deadlines or follow-ups need attention.
        </div>
      </div>
    );
  }

  const urgent = reminders.filter((r) => r.severity === "urgent").length;
  const shown = expanded ? reminders : reminders.slice(0, 4);

  return (
    <div className="animate-fade-in-up rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Needs attention
          </h2>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
              urgent > 0
                ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
            )}
          >
            {reminders.length}
          </span>
        </div>
        {reminders.length > 4 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {expanded ? "Show less" : `Show all ${reminders.length}`}
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {shown.map((r) => {
          const s = SEV_STYLE[r.severity];
          return (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r.appId)}
                className={cn(
                  "control-hover flex w-full items-center gap-3 rounded-lg border border-transparent bg-slate-50 px-3 py-2.5 text-left dark:bg-slate-800/50",
                  s.ring,
                )}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} />
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {r.company}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">
                    {" "}
                    · {r.role}
                  </span>
                </span>
                <span className={cn("shrink-0 text-xs font-medium", s.text)}>
                  {r.message}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
