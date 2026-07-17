"use client";

import {
  STATUS_META,
  type Application,
  type Priority,
} from "@/lib/types";
import { computeInsights } from "@/lib/insights";
import { cn } from "@/lib/utils";

const PRIORITY_BAR: Record<Priority, string> = {
  high: "bg-rose-500",
  medium: "bg-amber-500",
  low: "bg-slate-400",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in-up rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/** A labelled horizontal bar: name on the left, track, count on the right. */
function Bar({
  label,
  count,
  pct,
  color,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3" title={`${label}: ${count}`}>
      <span className="w-24 shrink-0 truncate text-xs text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="h-4 flex-1 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
        <div
          className={cn("h-full rounded-md transition-all duration-500", color)}
          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
        {count}
      </span>
    </div>
  );
}

export function InsightsView({ apps }: { apps: Application[] }) {
  const ins = computeInsights(apps);

  if (apps.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16 text-center dark:border-slate-700 dark:bg-slate-900/30">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Add some applications to see insights.
        </p>
      </div>
    );
  }

  const maxPipeline = Math.max(1, ...ins.pipeline.map((p) => p.count));
  const maxSource = Math.max(1, ...ins.bySource.map((s) => s.count));
  const maxPriority = Math.max(1, ...ins.byPriority.map((p) => p.count));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Conversion rates */}
      <div className="grid gap-4 sm:grid-cols-3">
        {ins.rates.map((r) => (
          <div
            key={r.key}
            className="hover-lift animate-fade-in-up rounded-2xl border border-black/5 bg-white p-6 shadow-sm hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/10 dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/50"
          >
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {r.label}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {r.pct}%
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {r.count} of {ins.appliedTotal} applied
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-linear-to-r from-blue-500 to-blue-400 transition-all duration-500"
                style={{ width: `${r.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pipeline */}
        <Card
          title="Pipeline"
          subtitle="Where your applications stand right now"
        >
          <div className="space-y-2.5">
            {ins.pipeline.map((p) => (
              <Bar
                key={p.status}
                label={STATUS_META[p.status].label}
                count={p.count}
                pct={(p.count / maxPipeline) * 100}
                color={STATUS_META[p.status].accent}
              />
            ))}
            <div className="mt-1 flex items-center gap-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
              <span className="w-24 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                Rejected
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-md bg-rose-500/70"
                  style={{
                    width: `${Math.max((ins.rejected / maxPipeline) * 100, ins.rejected > 0 ? 4 : 0)}%`,
                  }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                {ins.rejected}
              </span>
            </div>
          </div>
        </Card>

        {/* Weekly activity */}
        <Card
          title="Applications per week"
          subtitle="Submissions over the last 8 weeks"
        >
          <div className="flex h-40 items-end gap-2">
            {ins.weekly.map((w, i) => (
              <div
                key={i}
                className="flex flex-1 flex-col items-center gap-2"
                title={`${w.label}: ${w.count}`}
              >
                <span className="text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                  {w.count > 0 ? w.count : ""}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-linear-to-t from-blue-600 to-blue-400 transition-all duration-500"
                    style={{
                      height: `${(w.count / ins.maxWeekly) * 100}%`,
                      minHeight: w.count > 0 ? 6 : 2,
                      opacity: w.count > 0 ? 1 : 0.25,
                    }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {w.label}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* By source */}
        <Card title="By source" subtitle="Where your applications come from">
          {ins.bySource.length === 0 ? (
            <p className="text-xs text-slate-400">No data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {ins.bySource.map((s) => (
                <Bar
                  key={s.label}
                  label={s.label}
                  count={s.count}
                  pct={(s.count / maxSource) * 100}
                  color="bg-blue-500"
                />
              ))}
            </div>
          )}
        </Card>

        {/* By priority */}
        <Card title="By priority" subtitle="How your roles are prioritised">
          <div className="space-y-2.5">
            {ins.byPriority.map((p) => (
              <Bar
                key={p.priority}
                label={PRIORITY_LABEL[p.priority]}
                count={p.count}
                pct={(p.count / maxPriority) * 100}
                color={PRIORITY_BAR[p.priority]}
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
