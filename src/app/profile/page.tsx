"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  extractFromText,
  useProfile,
  RESUME_FILE_KEY,
  type Profile,
} from "@/lib/profile";
import { idbDel, idbGet, idbSet } from "@/lib/idb";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const labelCls =
  "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Card({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "animate-fade-in-up rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900",
        className,
      )}
    >
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-0.5 mb-4 text-xs text-slate-400 dark:text-slate-500">
          {subtitle}
        </p>
      )}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const { profile, ready, patch, addAnswer, updateAnswer, removeAnswer } =
    useProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [filledMsg, setFilledMsg] = useState<string | null>(null);

  function field<K extends keyof Profile>(key: K) {
    return {
      value: profile[key] as string,
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => patch({ [key]: e.target.value } as Partial<Profile>),
    };
  }

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setParseError("File is larger than 10 MB.");
      return;
    }
    setParseError(null);
    setUploading(true);
    try {
      await idbSet(RESUME_FILE_KEY, file);
      patch({
        resume: {
          name: file.name,
          size: file.size,
          type: file.type,
          uploadedAt: Date.now(),
        },
      });

      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/parse-resume", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (res.ok && typeof data.text === "string") {
        patch({ resumeText: data.text });
      } else {
        setParseError(data.error ?? "Couldn't extract text.");
      }
    } catch {
      setParseError("Upload failed. The file is saved — try re-parsing.");
    } finally {
      setUploading(false);
    }
  }

  async function downloadResume() {
    const blob = await idbGet(RESUME_FILE_KEY);
    if (!blob || !profile.resume) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = profile.resume.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function removeResume() {
    await idbDel(RESUME_FILE_KEY);
    patch({ resume: null });
    setParseError(null);
  }

  function autofill() {
    const found = extractFromText(profile.resumeText);
    const toApply: Partial<Profile> = {};
    const filled: string[] = [];
    (Object.keys(found) as (keyof Profile)[]).forEach((k) => {
      if (!profile[k]) {
        (toApply as Record<string, unknown>)[k] = found[k];
        filled.push(k);
      }
    });
    if (filled.length > 0) {
      patch(toApply);
      setFilledMsg(`Filled: ${filled.join(", ")}`);
    } else {
      setFilledMsg("Nothing new to fill (fields already set or not found).");
    }
    setTimeout(() => setFilledMsg(null), 4000);
  }

  if (!ready) {
    return (
      <div className="min-h-screen text-slate-100">
        <div className="mx-auto max-w-4xl px-5 py-10 text-center text-sm text-slate-400">
          Loading…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-slate-100">
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        {/* Header */}
        <div className="mb-8 animate-fade-in-up">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition hover:text-slate-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to tracker
          </Link>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Your profile
          </h1>
          <p className="mt-2 text-base text-slate-500 dark:text-slate-400">
            Your résumé and details — the information the auto-apply agent will
            use to fill out applications.
          </p>
        </div>

        <div className="space-y-6">
          {/* Resume upload */}
          <Card
            title="Résumé / CV"
            subtitle="Upload once; the agent reads it to answer application questions."
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) handleFile(f);
              }}
            />

            {profile.resume ? (
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-500/15 text-blue-500">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {profile.resume.name}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      {fmtSize(profile.resume.size)} ·{" "}
                      {new Date(profile.resume.uploadedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={downloadResume}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Replace
                  </button>
                  <button
                    onClick={removeResume}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 active:scale-95 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-4 py-10 text-center transition hover:border-blue-400 hover:bg-blue-500/5 dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-blue-500"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-500/15 text-blue-500">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 16V4m0 0 4 4m-4-4L8 8M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Upload your résumé
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  PDF, DOCX, or TXT · up to 10 MB
                </span>
              </button>
            )}

            {uploading && (
              <p className="mt-3 flex items-center gap-2 text-xs text-blue-500">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                Extracting text from your résumé…
              </p>
            )}
            {parseError && (
              <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                {parseError}
              </p>
            )}

            {/* Extracted text */}
            <div className="mt-5">
              <div className="mb-1 flex items-center justify-between">
                <label className={labelCls + " mb-0"}>
                  Extracted CV text{" "}
                  <span className="font-normal text-slate-400">
                    (what the AI reads — edit to correct)
                  </span>
                </label>
                <button
                  onClick={autofill}
                  disabled={!profile.resumeText}
                  className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-blue-400"
                >
                  Auto-fill contact info ↑
                </button>
              </div>
              <textarea
                {...field("resumeText")}
                placeholder="Upload a résumé to extract its text automatically, or paste it here."
                className={inputCls + " min-h-40 resize-y font-mono text-xs leading-relaxed"}
              />
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {profile.resumeText.length.toLocaleString()} characters
                </span>
                {filledMsg && (
                  <span className="text-xs text-emerald-500">{filledMsg}</span>
                )}
              </div>
            </div>
          </Card>

          {/* Basic details */}
          <Card title="Contact & basics">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Full name</label>
                <input {...field("fullName")} className={inputCls} placeholder="Jordan Lee" />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input {...field("email")} className={inputCls} placeholder="you@example.com" />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input {...field("phone")} className={inputCls} placeholder="+1 555 123 4567" />
              </div>
              <div>
                <label className={labelCls}>Location</label>
                <input {...field("location")} className={inputCls} placeholder="City, State" />
              </div>
              <div>
                <label className={labelCls}>LinkedIn</label>
                <input {...field("linkedin")} className={inputCls} placeholder="linkedin.com/in/…" />
              </div>
              <div>
                <label className={labelCls}>GitHub</label>
                <input {...field("github")} className={inputCls} placeholder="github.com/…" />
              </div>
              <div>
                <label className={labelCls}>Portfolio / website</label>
                <input {...field("portfolio")} className={inputCls} placeholder="https://…" />
              </div>
            </div>
          </Card>

          {/* Education */}
          <Card title="Education">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>School</label>
                <input {...field("school")} className={inputCls} placeholder="University of …" />
              </div>
              <div>
                <label className={labelCls}>Degree / major</label>
                <input {...field("degree")} className={inputCls} placeholder="BSc Computer Science" />
              </div>
              <div>
                <label className={labelCls}>Graduation</label>
                <input {...field("gradDate")} className={inputCls} placeholder="May 2027" />
              </div>
              <div>
                <label className={labelCls}>GPA (optional)</label>
                <input {...field("gpa")} className={inputCls} placeholder="3.8 / 4.0" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Skills</label>
                <textarea
                  {...field("skills")}
                  className={inputCls + " min-h-20 resize-y"}
                  placeholder="Python, React, SQL, distributed systems…"
                />
              </div>
            </div>
          </Card>

          {/* Work authorization */}
          <Card
            title="Work authorization"
            subtitle="Commonly asked and easy for the agent to get wrong — set it explicitly."
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Authorization status</label>
                <input
                  {...field("workAuthorization")}
                  className={inputCls}
                  placeholder="e.g. US Citizen, F-1 (needs CPT/OPT)"
                />
              </div>
              <div>
                <label className={labelCls}>Requires visa sponsorship?</label>
                <select {...field("needsSponsorship")} className={inputCls}>
                  <option value="">Not set</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
          </Card>

          {/* Common answers */}
          <Card
            title="Common application answers"
            subtitle="Reusable answers the agent can drop into application forms."
          >
            <div className="space-y-4">
              {profile.answers.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      value={a.question}
                      onChange={(e) =>
                        updateAnswer(a.id, { question: e.target.value })
                      }
                      placeholder="Question"
                      className="flex-1 rounded-md border border-transparent bg-transparent px-1 py-1 text-sm font-medium text-slate-800 outline-none focus:border-slate-300 dark:text-slate-100 dark:focus:border-slate-600"
                    />
                    <button
                      onClick={() => removeAnswer(a.id)}
                      className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40"
                      aria-label="Remove answer"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <textarea
                    value={a.answer}
                    onChange={(e) => updateAnswer(a.id, { answer: e.target.value })}
                    placeholder="Your answer…"
                    className={inputCls + " min-h-16 resize-y"}
                  />
                </div>
              ))}
              <button
                onClick={addAnswer}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition hover:border-blue-400 hover:text-blue-500 dark:border-slate-700"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Add question
              </button>
            </div>
          </Card>

          <p className="pb-4 text-center text-xs text-slate-400 dark:text-slate-600">
            Everything here is saved locally in your browser. Full AI extraction
            and auto-apply are coming in a later phase.
          </p>
        </div>
      </div>
    </div>
  );
}
