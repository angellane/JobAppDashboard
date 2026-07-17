"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
  type Application,
  type Priority,
  type Status,
} from "@/lib/types";
import { useApplications, type NewApplication } from "@/lib/store";
import { computeReminders } from "@/lib/insights";
import { cn } from "@/lib/utils";
import { StatsBar } from "@/components/StatsBar";
import { ApplicationTable } from "@/components/ApplicationTable";
import { KanbanBoard } from "@/components/KanbanBoard";
import { InsightsView } from "@/components/InsightsView";
import { RemindersPanel } from "@/components/RemindersPanel";
import { ApplicationForm } from "@/components/ApplicationForm";

type View = "board" | "table" | "insights";
type SortKey = "recent" | "priority" | "deadline" | "company";

const VIEW_KEY = "jobapp.view.v1";

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
  const { apps, ready, add, update, remove, replaceAll } = useApplications();

  const [view, setView] = useState<View>("board");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Application | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reminders = useMemo(() => computeReminders(apps), [apps]);

  // Restore the last-used view.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "board" || saved === "table" || saved === "insights") {
        setView(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function changeView(v: View) {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  }

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
  function openById(id: string) {
    const app = apps.find((a) => a.id === id);
    if (app) openEdit(app);
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

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file later
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!Array.isArray(parsed)) throw new Error("not an array");
        const valid = parsed.filter(
          (a) => a && typeof a.id === "string" && typeof a.company === "string",
        ) as Application[];
        if (valid.length === 0) throw new Error("no valid records");
        const count = apps.length;
        const proceed =
          count === 0 ||
          window.confirm(
            `Replace your current ${count} application${count === 1 ? "" : "s"} with ${valid.length} imported record${valid.length === 1 ? "" : "s"}? (Export first if you want a backup.)`,
          );
        if (proceed) replaceAll(valid);
      } catch {
        window.alert("Couldn't import that file — expected a JSON export.");
      }
    };
    reader.readAsText(file);
  }

  // Keyboard shortcut: "n" opens a new application (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (formOpen) return;
      const t = e.target as HTMLElement | null;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (typing) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openAdd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [formOpen]);

  const activeFilters =
    statusFilter !== "all" || priorityFilter !== "all" || query.trim() !== "";

  return (
    <div className="min-h-screen text-slate-100">
      <div className="mx-auto max-w-[1720px] px-5 py-10 sm:px-8 lg:px-12">
        {/* Centered column for everything except the board */}
        <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-10 flex animate-fade-in-up flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Internship Tracker
            </h1>
            <p className="mt-2 text-base text-slate-500 dark:text-slate-400">
              Summer 2027 · applications, statuses & deadlines in one place
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Import
            </button>
            <button
              onClick={() => exportJson(apps)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Export
            </button>
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-lg bg-linear-to-b from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 ring-1 ring-blue-400/30 transition hover:from-blue-400 hover:to-blue-500 active:scale-95"
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

        {/* Needs attention */}
        {ready && (
          <div className="mb-8">
            <RemindersPanel reminders={reminders} onSelect={openById} />
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div
            className={cn(
              "flex flex-1 flex-wrap items-center gap-3",
              view === "insights" && "pointer-events-none opacity-0",
            )}
            aria-hidden={view === "insights"}
          >
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
                className="control-hover w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm outline-none hover:border-blue-400/60 hover:shadow-md hover:shadow-blue-500/10 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/60"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Status | "all")}
              className="control-hover cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none hover:border-blue-400/60 hover:shadow-md hover:shadow-blue-500/10 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/60"
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
              className="control-hover cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none hover:border-blue-400/60 hover:shadow-md hover:shadow-blue-500/10 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/60"
            >
              <option value="all">All priorities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="control-hover cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none hover:border-blue-400/60 hover:shadow-md hover:shadow-blue-500/10 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-500/60"
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
          <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            {(["board", "table", "insights"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => changeView(v)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium capitalize transition",
                  view === v
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-100",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        </div>
        {/* end centered column */}

        {/* Content */}
        {!ready ? (
          <div className="py-20 text-center text-sm text-slate-400">Loading…</div>
        ) : view === "insights" ? (
          <InsightsView apps={apps} />
        ) : view === "board" ? (
          <KanbanBoard
            apps={filtered}
            onEdit={openEdit}
            onStatusChange={(id, status) => update(id, { status })}
          />
        ) : (
          <div className="mx-auto max-w-7xl">
            <ApplicationTable
              apps={filtered}
              onEdit={openEdit}
              onStatusChange={(id, status) => update(id, { status })}
            />
          </div>
        )}

        <p className="mx-auto mt-12 max-w-7xl text-center text-xs text-slate-400 dark:text-slate-600">
          Data is saved locally in your browser · press{" "}
          <kbd className="rounded border border-slate-300 px-1 font-mono dark:border-slate-700">
            N
          </kbd>{" "}
          to add · use Export to back it up.
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
