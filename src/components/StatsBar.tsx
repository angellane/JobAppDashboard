import type { Application } from "@/lib/types";

function pct(n: number, d: number): string {
  if (d === 0) return "0%";
  return Math.round((n / d) * 100) + "%";
}

export function StatsBar({ apps }: { apps: Application[] }) {
  const total = apps.length;
  const applied = apps.filter((a) => a.status !== "saved").length;
  const active = apps.filter(
    (a) => a.status !== "rejected" && a.status !== "saved",
  ).length;
  const interviews = apps.filter((a) => a.status === "interview").length;
  const offers = apps.filter((a) => a.status === "offer").length;
  // "Responses" = anything that moved past a plain application.
  const responded = apps.filter((a) =>
    ["assessment", "interview", "offer"].includes(a.status),
  ).length;

  const cards = [
    { label: "Total", value: total, sub: `${applied} applied` },
    { label: "Active", value: active, sub: "in the running" },
    {
      label: "Response rate",
      value: pct(responded, applied),
      sub: `${responded} responded`,
    },
    { label: "Interviews", value: interviews, sub: "in progress" },
    { label: "Offers", value: offers, sub: offers > 0 ? "🎉" : "—" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c, i) => (
        <div
          key={c.label}
          style={{ animationDelay: `${i * 60}ms` }}
          className="hover-lift animate-fade-in-up rounded-xl border border-black/5 bg-white p-4 shadow-sm hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/10 dark:border-white/10 dark:bg-slate-900 dark:hover:border-blue-500/50"
        >
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {c.label}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {c.value}
          </div>
          <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {c.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
