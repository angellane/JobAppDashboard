import type { WorkMode } from "./types";
import type { NewApplication } from "./store";

/** A single internship posting found by the discovery agent. */
export interface DiscoveredPosting {
  company: string;
  role: string;
  location: string;
  workMode: WorkMode | null;
  url: string;
  salary: string;
  source: string;
  /** one-line note on why it matches the search */
  summary: string;
}

export interface DiscoverRequest {
  roles: string[];
  location: string;
  keywords: string[];
  workMode: WorkMode | "any";
  count: number;
}

export interface DiscoverResponse {
  postings: DiscoveredPosting[];
  /** URLs the agent used as sources */
  sources: string[];
}

/** Normalised key used to dedupe postings against existing applications. */
export function dedupeKey(p: {
  company: string;
  role: string;
  url?: string;
}): string {
  if (p.url) {
    // Strip protocol/query so the same posting via different links collapses.
    const bare = p.url
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (bare) return "u:" + bare;
  }
  return (
    "cr:" +
    p.company.trim().toLowerCase() +
    "|" +
    p.role.trim().toLowerCase()
  );
}

/** Maps a discovered posting into a new "saved" application for the tracker. */
export function postingToApplication(p: DiscoveredPosting): NewApplication {
  return {
    company: p.company,
    role: p.role,
    location: p.location,
    workMode: p.workMode ?? "onsite",
    url: p.url,
    salary: p.salary,
    status: "saved",
    priority: "medium",
    source: p.source || "AI discovery",
    dateApplied: "",
    deadline: "",
    contact: "",
    notes: p.summary ? `Found by AI discovery — ${p.summary}` : "Found by AI discovery.",
  };
}
