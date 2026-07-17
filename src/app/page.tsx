"use client";

import { useMemo, useState } from "react";
import {
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
  type Application,
  type Priority,
  type Status,
} from "@/lib/types";
import { useApplications, type NewApplication } from "@/lib/store";
import { cn } from "@/lib/utils";
import { StatsBar } from "@/components/StatsBar";
import { ApplicationTable } from "@/components/ApplicationTable";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ApplicationForm } from "@/components/ApplicationForm";

type View = "board" | "table";
type SortKey = "recent" | "priority" | "deadline" | "company";

function exportJson(apps: Application[]) {
  const blob = new Blob([JSON.stringify(apps, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `job-applications-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const { apps, ready, add, update, remove } = useApplications();

  const [view, setView] = useState<View>("board");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = apps.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (priorityFilter !== "all" && a.priority !== priorityFilter)
        return false;
      if (q) {
        const hay =
          `${a.company} ${a.role} ${a.location} ${a.source} ${a.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "priority":
          return (
            PRIORITY_META[b.priority].weight - PRIORITY_META[a.priority].weight
          );
        case "company":
          return a.company.localeCompare(b.company);
        case "deadline": {
          const av = a.deadline || "9999-12-31";
          const bv = b.deadline || "9999-12-31";
          return av.localeCompare(bv);
        }
        case "recent":
        default:
          return b.updatedAt - a.updatedAt;
      }
    });
    return list;
  }, [apps, query, statusFilter, priorityFilter, sort]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(app: Application) {
    setEditing(app);
    setFormOpen(true);
  }
  function handleSubmit(data: NewApplication) {
    if (editing) update(editing.id, data);
    else add(data);
    setFormOpen(false);
    setEditing(null);
  }
  function handleDelete(id: string) {
    remove(id);
    setFormOpen(false);
    setEditing(null);
  }

  const activeFilters =
    statusFilter !== "all" || priorityFilter !== "all" || query.trim() !== "";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Internship Tracker
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Summer 2027 · applications, statuses & deadlines in one place
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportJson(apps)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Export
            </button>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Add application
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="mb-6">
          <StatsBar apps={apps} />
        </div>

        {/* Toolbar */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:max-w-xs">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              >
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search company, role, notes…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Status | "all")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">All statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value as Priority | "all")
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="recent">Sort: Recent</option>
              <option value="priority">Sort: Priority</option>
              <option value="deadline">Sort: Deadline</option>
              <option value="company">Sort: Company</option>
            </select>

            {activeFilters && (
              <button
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                  setPriorityFilter("all");
                }}
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Clear
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {(["board", "table"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition",
                  view === v
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {!ready ? (
          <div className="py-20 text-center text-sm text-slate-400">Loading…</div>
        ) : view === "board" ? (
          <KanbanBoard
            apps={filtered}
            onEdit={openEdit}
            onStatusChange={(id, status) => update(id, { status })}
          />
        ) : (
          <ApplicationTable
            apps={filtered}
            onEdit={openEdit}
            onStatusChange={(id, status) => update(id, { status })}
          />
        )}

        <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-600">
          Data is saved locally in your browser. Use Export to back it up.
        </p>
      </div>

      <ApplicationForm
        open={formOpen}
        editing={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />
    </div>
  );
}
