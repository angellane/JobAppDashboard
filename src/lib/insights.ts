import {
  STATUS_META,
  type Application,
  type Priority,
  type Status,
} from "./types";
import { daysUntil } from "./utils";

/** Whole days between an ISO date (yyyy-mm-dd) and today. Positive = in the past. */
function daysSince(iso: string): number | null {
  const d = daysUntil(iso);
  return d === null ? null : -d;
}

function daysSinceTs(ts: number): number {
  return Math.floor((Date.now() - ts) / 86400000);
}

// ---- Reminders / "needs attention" ---------------------------------------

export type ReminderSeverity = "urgent" | "warn" | "info";

export interface Reminder {
  id: string;
  appId: string;
  company: string;
  role: string;
  message: string;
  severity: ReminderSeverity;
  /** used to sort within a severity — smaller sorts first */
  order: number;
}

const SEV_RANK: Record<ReminderSeverity, number> = {
  urgent: 0,
  warn: 1,
  info: 2,
};

/**
 * Surfaces applications that need action: approaching/overdue deadlines,
 * applications gone quiet, and high-priority saved roles not yet applied to.
 */
export function computeReminders(apps: Application[]): Reminder[] {
  const out: Reminder[] = [];

  for (const a of apps) {
    if (a.status === "rejected") continue;

    // Deadlines (for anything not yet closed).
    const dl = daysUntil(a.deadline);
    if (dl !== null && a.status !== "offer") {
      if (dl < 0) {
        out.push({
          id: a.id + ":dl-over",
          appId: a.id,
          company: a.company,
          role: a.role,
          message: `Deadline passed ${-dl}d ago`,
          severity: "urgent",
          order: dl,
        });
      } else if (dl <= 3) {
        out.push({
          id: a.id + ":dl-soon",
          appId: a.id,
          company: a.company,
          role: a.role,
          message:
            dl === 0 ? "Deadline is today" : `Deadline in ${dl} day${dl === 1 ? "" : "s"}`,
          severity: dl <= 1 ? "urgent" : "warn",
          order: dl,
        });
      }
    }

    // Applications gone quiet — waiting on a reply.
    if (a.status === "applied") {
      const since = daysSince(a.dateApplied);
      if (since !== null && since >= 10) {
        out.push({
          id: a.id + ":stale",
          appId: a.id,
          company: a.company,
          role: a.role,
          message: `No reply — ${since}d since you applied. Consider a follow-up.`,
          severity: since >= 21 ? "warn" : "info",
          order: -since,
        });
      }
    }

    // Interview with no movement in a while.
    if (a.status === "assessment" || a.status === "interview") {
      const quiet = daysSinceTs(a.updatedAt);
      if (quiet >= 7) {
        out.push({
          id: a.id + ":quiet",
          appId: a.id,
          company: a.company,
          role: a.role,
          message: `${STATUS_META[a.status].label} stage — no update in ${quiet}d. Check in?`,
          severity: "warn",
          order: -quiet,
        });
      }
    }

    // High-priority roles still only saved.
    if (a.status === "saved" && a.priority === "high") {
      const age = daysSinceTs(a.createdAt);
      if (age >= 5) {
        out.push({
          id: a.id + ":unapplied",
          appId: a.id,
          company: a.company,
          role: a.role,
          message: `High priority, still saved after ${age}d — time to apply?`,
          severity: "info",
          order: -age,
        });
      }
    }
  }

  return out.sort(
    (x, y) => SEV_RANK[x.severity] - SEV_RANK[y.severity] || x.order - y.order,
  );
}

// ---- Analytics ------------------------------------------------------------

export interface Insights {
  total: number;
  appliedTotal: number; // submitted at least once (status !== saved)
  pipeline: { status: Status; count: number }[];
  rejected: number;
  rates: { key: string; label: string; count: number; pct: number }[];
  bySource: { label: string; count: number }[];
  byPriority: { priority: Priority; count: number }[];
  weekly: { label: string; count: number }[];
  maxWeekly: number;
}

const PIPELINE: Status[] = [
  "saved",
  "applied",
  "assessment",
  "interview",
  "offer",
];

export function computeInsights(apps: Application[]): Insights {
  const total = apps.length;

  const pipeline = PIPELINE.map((status) => ({
    status,
    count: apps.filter((a) => a.status === status).length,
  }));
  const rejected = apps.filter((a) => a.status === "rejected").length;

  const appliedTotal = apps.filter((a) => a.status !== "saved").length;
  // Current status is treated as the furthest stage reached.
  const responded = apps.filter((a) =>
    ["assessment", "interview", "offer"].includes(a.status),
  ).length;
  const interviewed = apps.filter((a) =>
    ["interview", "offer"].includes(a.status),
  ).length;
  const offers = apps.filter((a) => a.status === "offer").length;

  const pctOf = (n: number) =>
    appliedTotal === 0 ? 0 : Math.round((n / appliedTotal) * 100);

  const rates = [
    { key: "response", label: "Response rate", count: responded, pct: pctOf(responded) },
    { key: "interview", label: "Interview rate", count: interviewed, pct: pctOf(interviewed) },
    { key: "offer", label: "Offer rate", count: offers, pct: pctOf(offers) },
  ];

  // By source (categorical) — group blanks under "Unknown".
  const sourceMap = new Map<string, number>();
  for (const a of apps) {
    const key = a.source.trim() || "Unknown";
    sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1);
  }
  const bySource = [...sourceMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const byPriority = (["high", "medium", "low"] as Priority[]).map(
    (priority) => ({
      priority,
      count: apps.filter((a) => a.priority === priority).length,
    }),
  );

  // Applications submitted per week over the last 8 weeks (by dateApplied).
  const weeks = 8;
  const buckets = new Array(weeks).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const a of apps) {
    if (!a.dateApplied) continue;
    const since = daysSince(a.dateApplied);
    if (since === null || since < 0) continue;
    const wk = Math.floor(since / 7);
    if (wk < weeks) buckets[weeks - 1 - wk] += 1;
  }
  const weekly = buckets.map((count, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (weeks - 1 - i) * 7);
    return {
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count,
    };
  });
  const maxWeekly = Math.max(1, ...buckets);

  return {
    total,
    appliedTotal,
    pipeline,
    rejected,
    rates,
    bySource,
    byPriority,
    weekly,
    maxWeekly,
  };
}
