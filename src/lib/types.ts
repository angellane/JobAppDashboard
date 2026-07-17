export type Status =
  | "saved"
  | "applied"
  | "assessment"
  | "interview"
  | "offer"
  | "rejected";

export type Priority = "low" | "medium" | "high";

export type WorkMode = "onsite" | "remote" | "hybrid";

export interface Application {
  id: string;
  company: string;
  role: string;
  location: string;
  workMode: WorkMode;
  url: string;
  salary: string;
  status: Status;
  priority: Priority;
  source: string; // e.g. LinkedIn, referral, careers page
  dateApplied: string; // ISO date (yyyy-mm-dd) or ""
  deadline: string; // ISO date or ""
  contact: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface StatusMeta {
  key: Status;
  label: string;
  /** short helper describing what the status means */
  hint: string;
  /** tailwind classes for badges / accents */
  badge: string;
  dot: string;
  /** column accent bar */
  accent: string;
  /** whether this status counts as an "active"/open application */
  active: boolean;
}

export const STATUS_ORDER: Status[] = [
  "saved",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
];

export const STATUS_META: Record<Status, StatusMeta> = {
  saved: {
    key: "saved",
    label: "Saved",
    hint: "On your radar — not applied yet",
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    dot: "bg-slate-400",
    accent: "bg-slate-400",
    active: true,
  },
  applied: {
    key: "applied",
    label: "Applied",
    hint: "Submitted — waiting to hear back",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    dot: "bg-blue-500",
    accent: "bg-blue-500",
    active: true,
  },
  assessment: {
    key: "assessment",
    label: "Assessment",
    hint: "Online assessment / take-home",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    dot: "bg-amber-500",
    accent: "bg-amber-500",
    active: true,
  },
  interview: {
    key: "interview",
    label: "Interview",
    hint: "In the interview process",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    dot: "bg-violet-500",
    accent: "bg-violet-500",
    active: true,
  },
  offer: {
    key: "offer",
    label: "Offer",
    hint: "Offer received 🎉",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
    accent: "bg-emerald-500",
    active: true,
  },
  rejected: {
    key: "rejected",
    label: "Rejected",
    hint: "Closed — rejected or withdrawn",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    dot: "bg-rose-500",
    accent: "bg-rose-500",
    active: false,
  },
};

export const PRIORITY_META: Record<
  Priority,
  { label: string; badge: string; weight: number }
> = {
  high: {
    label: "High",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    weight: 3,
  },
  medium: {
    label: "Medium",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    weight: 2,
  },
  low: {
    label: "Low",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    weight: 1,
  },
};

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  onsite: "On-site",
  remote: "Remote",
  hybrid: "Hybrid",
};
