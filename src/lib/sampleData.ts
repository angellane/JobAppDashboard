import type { Application } from "./types";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const now = Date.now();

/** A few example rows shown on first launch. Editable / deletable like any other. */
export const SAMPLE_APPLICATIONS: Application[] = [
  {
    id: "sample-1",
    company: "Stripe",
    role: "Software Engineering Intern",
    location: "Seattle, WA",
    workMode: "hybrid",
    url: "https://stripe.com/jobs",
    salary: "$9,500 / mo",
    status: "interview",
    priority: "high",
    source: "Referral",
    dateApplied: daysAgo(21),
    deadline: "",
    contact: "alex@stripe.com",
    notes: "Phone screen went well. Onsite loop scheduled next week.",
    createdAt: now - 21 * 86400000,
    updatedAt: now - 2 * 86400000,
  },
  {
    id: "sample-2",
    company: "Datadog",
    role: "Backend Engineering Intern",
    location: "New York, NY",
    workMode: "onsite",
    url: "https://careers.datadoghq.com",
    salary: "$8,800 / mo",
    status: "assessment",
    priority: "high",
    source: "LinkedIn",
    dateApplied: daysAgo(9),
    deadline: daysAhead(3),
    contact: "",
    notes: "HackerRank OA due soon — 90 min, 3 problems.",
    createdAt: now - 9 * 86400000,
    updatedAt: now - 1 * 86400000,
  },
  {
    id: "sample-3",
    company: "Notion",
    role: "Product Engineering Intern",
    location: "San Francisco, CA",
    workMode: "hybrid",
    url: "https://notion.so/careers",
    salary: "",
    status: "applied",
    priority: "medium",
    source: "Company site",
    dateApplied: daysAgo(5),
    deadline: "",
    contact: "",
    notes: "",
    createdAt: now - 5 * 86400000,
    updatedAt: now - 5 * 86400000,
  },
  {
    id: "sample-4",
    company: "Ramp",
    role: "Full-Stack Intern",
    location: "Remote (US)",
    workMode: "remote",
    url: "https://ramp.com/careers",
    salary: "$9,000 / mo",
    status: "saved",
    priority: "high",
    source: "Job board",
    dateApplied: "",
    deadline: daysAhead(10),
    contact: "",
    notes: "Need to tailor resume before applying.",
    createdAt: now - 2 * 86400000,
    updatedAt: now - 2 * 86400000,
  },
  {
    id: "sample-5",
    company: "Airtable",
    role: "Software Engineer Intern",
    location: "San Francisco, CA",
    workMode: "hybrid",
    url: "https://airtable.com/careers",
    salary: "",
    status: "rejected",
    priority: "medium",
    source: "LinkedIn",
    dateApplied: daysAgo(30),
    deadline: "",
    contact: "",
    notes: "Rejected after resume screen.",
    createdAt: now - 30 * 86400000,
    updatedAt: now - 12 * 86400000,
  },
];
