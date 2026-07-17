"use client";

import { useEffect, useState } from "react";
import {
  STATUS_ORDER,
  STATUS_META,
  WORK_MODE_LABEL,
  type Application,
  type Priority,
  type Status,
  type WorkMode,
} from "@/lib/types";
import type { NewApplication } from "@/lib/store";
import { todayISO } from "@/lib/utils";

function emptyApp(): NewApplication {
  return {
    company: "",
    role: "",
    location: "",
    workMode: "onsite",
    url: "",
    salary: "",
    status: "saved",
    priority: "medium",
    source: "",
    dateApplied: "",
    deadline: "",
    contact: "",
    notes: "",
  };
}

interface Props {
  open: boolean;
  /** existing app to edit, or null to create */
  editing: Application | null;
  onClose: () => void;
  onSubmit: (data: NewApplication) => void;
  onDelete?: (id: string) => void;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const labelCls =
  "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

export function ApplicationForm({
  open,
  editing,
  onClose,
  onSubmit,
  onDelete,
}: Props) {
  const [form, setForm] = useState<NewApplication>(emptyApp());

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const { id, createdAt, updatedAt, ...rest } = editing;
      void id;
      void createdAt;
      void updatedAt;
      setForm(rest);
    } else {
      setForm(emptyApp());
    }
  }, [open, editing]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function set<K extends keyof NewApplication>(
    key: K,
    value: NewApplication[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company.trim() || !form.role.trim()) return;
    // If moving off "saved" without a date, stamp today.
    const data = { ...form };
    if (data.status !== "saved" && !data.dateApplied) {
      data.dateApplied = todayISO();
    }
    onSubmit(data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl animate-scale-in rounded-2xl border border-black/5 bg-white shadow-2xl shadow-blue-950/30 dark:border-white/10 dark:bg-slate-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-7 py-5 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {editing ? "Edit application" : "Add application"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6 6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-7 py-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <label className={labelCls}>Company *</label>
              <input
                className={inputCls}
                value={form.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="Stripe"
                autoFocus
                required
              />
            </div>
            <div className="sm:col-span-1">
              <label className={labelCls}>Role *</label>
              <input
                className={inputCls}
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
                placeholder="Software Engineering Intern"
                required
              />
            </div>

            <div>
              <label className={labelCls}>Location</label>
              <input
                className={inputCls}
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Seattle, WA"
              />
            </div>
            <div>
              <label className={labelCls}>Work mode</label>
              <select
                className={inputCls}
                value={form.workMode}
                onChange={(e) => set("workMode", e.target.value as WorkMode)}
              >
                {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => (
                  <option key={m} value={m}>
                    {WORK_MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => set("status", e.target.value as Status)}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select
                className={inputCls}
                value={form.priority}
                onChange={(e) => set("priority", e.target.value as Priority)}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Date applied</label>
              <input
                type="date"
                className={inputCls}
                value={form.dateApplied}
                onChange={(e) => set("dateApplied", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>Deadline</label>
              <input
                type="date"
                className={inputCls}
                value={form.deadline}
                onChange={(e) => set("deadline", e.target.value)}
              />
            </div>

            <div>
              <label className={labelCls}>Salary / stipend</label>
              <input
                className={inputCls}
                value={form.salary}
                onChange={(e) => set("salary", e.target.value)}
                placeholder="$9,000 / mo"
              />
            </div>
            <div>
              <label className={labelCls}>Source</label>
              <input
                className={inputCls}
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
                placeholder="LinkedIn, referral, careers page…"
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Posting URL</label>
              <input
                type="url"
                className={inputCls}
                value={form.url}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Contact</label>
              <input
                className={inputCls}
                value={form.contact}
                onChange={(e) => set("contact", e.target.value)}
                placeholder="Recruiter name / email"
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea
                className={inputCls + " min-h-20 resize-y"}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Interview prep, referral details, next steps…"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div>
              {editing && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(editing.id)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-linear-to-b from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 ring-1 ring-blue-400/30 transition hover:from-blue-400 hover:to-blue-500 active:scale-95"
              >
                {editing ? "Save changes" : "Add application"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
