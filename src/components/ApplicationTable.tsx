"use client";

import {
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
  WORK_MODE_LABEL,
  type Application,
  type Status,
} from "@/lib/types";
import { cn, daysUntil, fmtDate, relDays } from "@/lib/utils";

interface Props {
  apps: Application[];
  onEdit: (app: Application) => void;
  onStatusChange: (id: string, status: Status) => void;
}

function DeadlinePill({ iso }: { iso: string }) {
  const d = daysUntil(iso);
  if (d === null) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const urgent = d <= 3 && d >= 0;
  const past = d < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        urgent && "text-amber-600 dark:text-amber-400",
        past && "text-rose-600 dark:text-rose-400",
        !urgent && !past && "text-slate-500 dark:text-slate-400",
      )}
      title={fmtDate(iso)}
    >
      {(urgent || past) && (
        <span className={cn("h-1.5 w-1.5 rounded-full", past ? "bg-rose-500" : "bg-amber-500")} />
      )}
      {fmtDate(iso)} · {relDays(iso)}
    </span>
  );
}

export function ApplicationTable({ apps, onEdit, onStatusChange }: Props) {
  if (apps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 py-16 text-center dark:border-slate-700 dark:bg-slate-900/30">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No applications match your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-black/5 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
      <table className="w-full min-w-205 border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <th className="px-5 py-4 font-medium">Company / Role</th>
            <th className="px-5 py-4 font-medium">Location</th>
            <th className="px-5 py-4 font-medium">Status</th>
            <th className="px-5 py-4 font-medium">Priority</th>
            <th className="px-5 py-4 font-medium">Applied</th>
            <th className="px-5 py-4 font-medium">Deadline</th>
            <th className="px-5 py-4" />
          </tr>
        </thead>
        <tbody>
          {apps.map((a, i) => (
            <tr
              key={a.id}
              style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
              className="group animate-fade-in-up cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
              onClick={() => onEdit(a)}
            >
              <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {a.company}
                  </span>
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-slate-300 transition hover:text-blue-500 dark:text-slate-600"
                      title="Open posting"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M7 17 17 7M17 7H9m8 0v8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  )}
                </div>
                <div className="text-slate-500 dark:text-slate-400">{a.role}</div>
              </td>
              <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                <div>{a.location || "—"}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  {WORK_MODE_LABEL[a.workMode]}
                </div>
              </td>
              <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                <select
                  value={a.status}
                  onChange={(e) => onStatusChange(a.id, e.target.value as Status)}
                  className={cn(
                    "cursor-pointer rounded-full border-0 px-2.5 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/30",
                    STATUS_META[a.status].badge,
                  )}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-5 py-4">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-medium",
                    PRIORITY_META[a.priority].badge,
                  )}
                >
                  {PRIORITY_META[a.priority].label}
                </span>
              </td>
              <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                {a.dateApplied ? (
                  <span title={a.dateApplied}>{fmtDate(a.dateApplied)}</span>
                ) : (
                  <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
              </td>
              <td className="px-5 py-4">
                <DeadlinePill iso={a.deadline} />
              </td>
              <td className="px-5 py-4 text-right">
                <span className="text-slate-300 opacity-0 transition group-hover:opacity-100 dark:text-slate-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="inline">
                    <path
                      d="m12 20 8-8-4-4-8 8v4h4Zm2-14 4 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
