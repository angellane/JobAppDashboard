"use client";

import { useState } from "react";
import {
  PRIORITY_META,
  STATUS_META,
  STATUS_ORDER,
  WORK_MODE_LABEL,
  type Application,
  type Status,
} from "@/lib/types";
import { cn, daysUntil, fmtDate } from "@/lib/utils";

interface Props {
  apps: Application[];
  onEdit: (app: Application) => void;
  onStatusChange: (id: string, status: Status) => void;
}

function Card({
  app,
  onEdit,
  index,
}: {
  app: Application;
  onEdit: (a: Application) => void;
  index: number;
}) {
  const dl = daysUntil(app.deadline);
  const [dragging, setDragging] = useState(false);
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", app.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={() => onEdit(app)}
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
      className={cn(
        "hover-lift w-full animate-pop-in cursor-grab rounded-xl border border-black/5 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-lg hover:shadow-blue-950/20 active:cursor-grabbing dark:border-white/10 dark:bg-slate-800",
        dragging && "rotate-2 opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {app.company}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium",
            PRIORITY_META[app.priority].badge,
          )}
        >
          {PRIORITY_META[app.priority].label}
        </span>
      </div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {app.role}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
        {app.location && <span>{app.location}</span>}
        <span>· {WORK_MODE_LABEL[app.workMode]}</span>
      </div>
      {dl !== null && (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
            dl < 0
              ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
              : dl <= 3
                ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                : "bg-slate-50 text-slate-500 dark:bg-slate-700/40 dark:text-slate-400",
          )}
        >
          ⏱ {fmtDate(app.deadline)}
          {dl >= 0 ? ` · ${dl}d left` : " · overdue"}
        </div>
      )}
    </button>
  );
}

export function KanbanBoard({ apps, onEdit, onStatusChange }: Props) {
  const [over, setOver] = useState<Status | null>(null);

  return (
    <div className="flex gap-4 overflow-x-auto pb-3">
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        const items = apps.filter((a) => a.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver((s) => (s === status ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) onStatusChange(id, status);
              setOver(null);
            }}
            className={cn(
              "flex w-72 shrink-0 animate-fade-in flex-col rounded-xl border bg-slate-50/60 transition dark:bg-slate-900/40",
              over === status
                ? "border-blue-400 ring-2 ring-blue-400/30 dark:border-blue-500"
                : "border-black/5 dark:border-white/10",
            )}
          >
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", meta.accent)} />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {meta.label}
                </span>
              </div>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400">
                {items.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-3 px-3 pb-3">
              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-600">
                  Drop here
                </div>
              ) : (
                items.map((app, i) => (
                  <Card key={app.id} app={app} onEdit={onEdit} index={i} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
