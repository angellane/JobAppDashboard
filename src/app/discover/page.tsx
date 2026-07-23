"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApplications } from "@/lib/store";
import {
  dedupeKey,
  postingToApplication,
  type DiscoveredPosting,
} from "@/lib/discovery";
import { WORK_MODE_LABEL, type WorkMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TagInput } from "@/components/TagInput";

const CRITERIA_KEY = "jobapp.discover.v1";

const COUNTRIES: { code: string; name: string }[] = [
  { code: "us", name: "United States" },
  { code: "ie", name: "Ireland" },
  { code: "gb", name: "United Kingdom" },
  { code: "ca", name: "Canada" },
  { code: "au", name: "Australia" },
  { code: "de", name: "Germany" },
  { code: "fr", name: "France" },
  { code: "nl", name: "Netherlands" },
  { code: "es", name: "Spain" },
  { code: "it", name: "Italy" },
  { code: "se", name: "Sweden" },
  { code: "ch", name: "Switzerland" },
  { code: "pl", name: "Poland" },
  { code: "nz", name: "New Zealand" },
  { code: "in", name: "India" },
  { code: "sg", name: "Singapore" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "za", name: "South Africa" },
  { code: "br", name: "Brazil" },
  { code: "mx", name: "Mexico" },
  { code: "jp", name: "Japan" },
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";
const labelCls =
  "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

export default function DiscoverPage() {
  const { apps, add } = useApplications();

  const [roles, setRoles] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [country, setCountry] = useState("us");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState<WorkMode | "any">("any");
  const [count, setCount] = useState(8);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [results, setResults] = useState<DiscoveredPosting[] | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  // Mirror any uncommitted text in the tag inputs so search still uses it.
  const rolesPending = useRef("");
  const keywordsPending = useRef("");

  function withPending(list: string[], pending: string): string[] {
    const p = pending.trim();
    if (p && !list.some((x) => x.toLowerCase() === p.toLowerCase())) {
      return [...list, p];
    }
    return list;
  }

  // Restore last-used criteria.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CRITERIA_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        // Support both the new array shape and the earlier single-string shape.
        const toArr = (v: unknown): string[] =>
          Array.isArray(v)
            ? v.filter((x): x is string => typeof x === "string")
            : typeof v === "string" && v.trim()
              ? [v.trim()]
              : [];
        setRoles(toArr(c.roles ?? c.role));
        setLocation(c.location ?? "");
        setCountry(c.country ?? "us");
        setKeywords(toArr(c.keywords));
        setWorkMode(c.workMode ?? "any");
        setCount(c.count ?? 8);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const existingKeys = useMemo(
    () =>
      new Set(apps.map((a) => dedupeKey({ company: a.company, role: a.role }))),
    [apps],
  );

  function persist(r: string[], k: string[]) {
    try {
      window.localStorage.setItem(
        CRITERIA_KEY,
        JSON.stringify({ roles: r, location, country, keywords: k, workMode, count }),
      );
    } catch {
      /* ignore */
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    // Include any text typed but not yet turned into a chip.
    const effRoles = withPending(roles, rolesPending.current);
    const effKeywords = withPending(keywords, keywordsPending.current);
    if (effRoles.length === 0) {
      setError("Add at least one role to search for.");
      return;
    }
    // Commit drafts into the visible chips.
    if (effRoles.length !== roles.length) setRoles(effRoles);
    if (effKeywords.length !== keywords.length) setKeywords(effKeywords);
    rolesPending.current = "";
    keywordsPending.current = "";

    persist(effRoles, effKeywords);
    setLoading(true);
    setError(null);
    setSetupNeeded(false);
    setResults(null);
    setSources([]);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roles: effRoles,
          location,
          country,
          keywords: effKeywords,
          workMode,
          count,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSetupNeeded(Boolean(data.setup));
        setError(data.error ?? "Search failed.");
        return;
      }
      setResults(data.postings ?? []);
      setSources(data.sources ?? []);
    } catch {
      setError("Couldn't reach the discovery service.");
    } finally {
      setLoading(false);
    }
  }

  function addPosting(p: DiscoveredPosting) {
    const key = dedupeKey({ company: p.company, role: p.role });
    add(postingToApplication(p));
    setAddedKeys((prev) => new Set(prev).add(key));
  }

  function addAllNew() {
    if (!results) return;
    for (const p of results) {
      const key = dedupeKey({ company: p.company, role: p.role });
      if (!existingKeys.has(key) && !addedKeys.has(key)) addPosting(p);
    }
  }

  const newCount = results
    ? results.filter((p) => {
        const key = dedupeKey({ company: p.company, role: p.role });
        return !existingKeys.has(key) && !addedKeys.has(key);
      }).length
    : 0;

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
          <h1 className="mt-3 flex items-center gap-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Discover internships
            <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-400">
              AI
            </span>
          </h1>
          <p className="mt-2 text-base text-slate-500 dark:text-slate-400">
            Pulls live internship listings from across the web (via Google for
            Jobs) for your roles and location — add the ones you want to your
            tracker.
          </p>
        </div>

        {/* Search form */}
        <form
          onSubmit={runSearch}
          className="animate-fade-in-up rounded-2xl border border-black/5 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-900"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Roles *{" "}
                <span className="font-normal text-slate-400">
                  (type and press Enter to add several)
                </span>
              </label>
              <TagInput
                values={roles}
                onChange={setRoles}
                pendingRef={rolesPending}
                placeholder="Software Engineer, Data Analyst…"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Location</label>
                <input
                  className={inputCls}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Limerick · Seattle · Remote"
                />
              </div>
              <div>
                <label className={labelCls}>Country</label>
                <select
                  className={inputCls}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Keywords / timeframe{" "}
                <span className="font-normal text-slate-400">
                  (optional — Enter to add)
                </span>
              </label>
              <TagInput
                values={keywords}
                onChange={setKeywords}
                pendingRef={keywordsPending}
                placeholder="Summer 2027, fintech, new grad…"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Work mode</label>
                <select
                  className={inputCls}
                  value={workMode}
                  onChange={(e) =>
                    setWorkMode(e.target.value as WorkMode | "any")
                  }
                >
                  <option value="any">Any</option>
                  {(Object.keys(WORK_MODE_LABEL) as WorkMode[]).map((m) => (
                    <option key={m} value={m}>
                      {WORK_MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Results</label>
                <select
                  className={inputCls}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                >
                  {[5, 8, 12, 15].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-linear-to-b from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 ring-1 ring-blue-400/30 transition hover:from-blue-400 hover:to-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                  Searching the web…
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                    <path d="m20 20-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Find internships
                </>
              )}
            </button>
            {loading && (
              <span className="text-xs text-slate-400">
                Fetching live listings…
              </span>
            )}
          </div>
        </form>

        {/* Error / setup */}
        {error && (
          <div className="mt-6 animate-fade-in rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
            <p className="font-medium text-amber-600 dark:text-amber-400">
              {error}
            </p>
            {setupNeeded && (
              <div className="mt-2 text-slate-500 dark:text-slate-400">
                <p>
                  Add a free JSearch key to{" "}
                  <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                    .env.local
                  </code>{" "}
                  (real job listings, 200 searches/month, no card):
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-800">
{`# .env.local
JSEARCH_API_KEY=your_key   # openwebninja.com/api/jsearch`}
                </pre>
                <p className="mt-2">Then restart the dev server.</p>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {results.length} result{results.length === 1 ? "" : "s"}
                {sources.length > 0 && (
                  <span className="ml-2 font-normal text-slate-400">
                    · {sources.length} sources searched
                  </span>
                )}
              </h2>
              {newCount > 0 && (
                <button
                  onClick={addAllNew}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Add all {newCount} new
                </button>
              )}
            </div>

            {results.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-14 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/30">
                No open postings found. Try a broader role or location.
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((p, i) => {
                  const key = dedupeKey({ company: p.company, role: p.role });
                  const inTracker = existingKeys.has(key);
                  const added = addedKeys.has(key);
                  return (
                    <div
                      key={i}
                      style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                      className="hover-lift animate-fade-in-up rounded-2xl border border-black/5 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {p.company}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-sm text-slate-600 dark:text-slate-300">
                              {p.role}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                            {p.location && <span>{p.location}</span>}
                            {p.workMode && <span>· {WORK_MODE_LABEL[p.workMode]}</span>}
                            {p.salary && <span>· {p.salary}</span>}
                            {p.source && <span>· {p.source}</span>}
                          </div>
                          {p.summary && (
                            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                              {p.summary}
                            </p>
                          )}
                          {p.url && (
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              View posting
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
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
                        <button
                          onClick={() => addPosting(p)}
                          disabled={inTracker || added}
                          className={cn(
                            "shrink-0 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition active:scale-95",
                            inTracker || added
                              ? "cursor-default bg-emerald-500/15 text-emerald-500"
                              : "bg-blue-600 text-white hover:bg-blue-500",
                          )}
                        >
                          {inTracker ? "In tracker" : added ? "Added ✓" : "Add"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
              AI results can be imperfect — double-check details on the posting
              before applying.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
