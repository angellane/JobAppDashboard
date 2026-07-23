import { NextResponse } from "next/server";
import { generateText, Output, type LanguageModel } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { DiscoveredPosting } from "@/lib/discovery";
import type { WorkMode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Free structuring model — flash-lite is the cheapest current flash and has the
// highest free-tier limits. (gemini-2.5-flash 404s for new AI Studio keys.)
const GEMINI_MODEL = "gemini-flash-lite-latest";
// Gateway fallback (usage-billed).
const GATEWAY_SEARCH_MODEL = "perplexity/sonar-pro";
const GATEWAY_STRUCTURE_MODEL = "anthropic/claude-sonnet-5";

const MAX_ROLES = 6;
const MAX_FINDINGS_CHARS = 14000;

// Plain enum (no null/unions) keeps Google's structured-output schema happy.
const postingSchema = z.object({
  postings: z.array(
    z.object({
      company: z.string().describe("Hiring company name"),
      role: z.string().describe("Exact job/role title"),
      location: z.string().describe("City, State/Country, or 'Remote'"),
      workMode: z
        .enum(["onsite", "remote", "hybrid", "unknown"])
        .describe("'unknown' if not stated"),
      url: z.string().describe("Direct application/posting URL from the findings"),
      salary: z.string().describe("Pay/stipend if stated, else empty string"),
      source: z.string().describe("Source site, e.g. LinkedIn, company careers"),
      summary: z.string().describe("One short line on why it matches the search"),
    }),
  ),
});

type RawPosting = z.infer<typeof postingSchema>["postings"][number];

function normalize(raw: RawPosting[]): DiscoveredPosting[] {
  return raw.map((p) => ({
    company: p.company,
    role: p.role,
    location: p.location,
    workMode: p.workMode === "unknown" ? null : (p.workMode as WorkMode),
    url: p.url,
    salary: p.salary,
    source: p.source,
    summary: p.summary,
  }));
}

// ---- Primary source: SerpApi (Google for Jobs, accurate location) ----------

const SERPAPI_URL = "https://serpapi.com/search.json";

// SerpApi's google_jobs engine needs a `location` name (not a `gl` code).
const COUNTRY_NAMES: Record<string, string> = {
  us: "United States",
  ie: "Ireland",
  gb: "United Kingdom",
  ca: "Canada",
  au: "Australia",
  de: "Germany",
  fr: "France",
  nl: "Netherlands",
  es: "Spain",
  it: "Italy",
  se: "Sweden",
  ch: "Switzerland",
  pl: "Poland",
  nz: "New Zealand",
  in: "India",
  sg: "Singapore",
  ae: "United Arab Emirates",
  za: "South Africa",
  br: "Brazil",
  mx: "Mexico",
  jp: "Japan",
};

interface SerpJob {
  title?: string;
  company_name?: string;
  location?: string;
  via?: string;
  description?: string;
  share_link?: string;
  job_id?: string;
  detected_extensions?: {
    posted_at?: string;
    schedule_type?: string;
    work_from_home?: boolean;
    salary?: string;
  };
  apply_options?: { title?: string; link?: string }[];
}

function isInternship(j: SerpJob): boolean {
  return (
    /intern/i.test(j.detected_extensions?.schedule_type || "") ||
    /intern|placement|co-?op|trainee/i.test(j.title || "")
  );
}

function mapSerpJob(j: SerpJob): DiscoveredPosting {
  const de = j.detected_extensions || {};
  return {
    company: j.company_name || "Unknown",
    role: j.title || "",
    location: j.location || "",
    workMode: de.work_from_home ? "remote" : null,
    url:
      (Array.isArray(j.apply_options) && j.apply_options[0]?.link) ||
      j.share_link ||
      "",
    salary: de.salary || "",
    source: (j.via || "").replace(/^via\s+/i, "") || "Google Jobs",
    summary: (j.description || "").replace(/\s+/g, " ").trim().slice(0, 180),
  };
}

async function discoverWithSerpApi(
  roles: string[],
  location: string,
  keywords: string,
  country: string,
  count: number,
) {
  async function one(role: string) {
    const query = [role, "intern", keywords].filter(Boolean).join(" ").trim();
    const countryName = COUNTRY_NAMES[country] || "";
    // Try the most specific location first, then broaden on a location error.
    const candidates = [
      [location, countryName].filter(Boolean).join(", "),
      countryName,
      "",
    ].filter((v, i, a) => a.indexOf(v) === i);

    for (let i = 0; i < candidates.length; i++) {
      const loc = candidates[i];
      const url = new URL(SERPAPI_URL);
      url.searchParams.set("engine", "google_jobs");
      url.searchParams.set("q", query);
      if (loc) url.searchParams.set("location", loc);
      url.searchParams.set("hl", "en");
      url.searchParams.set("api_key", process.env.SERPAPI_API_KEY as string);

      const res = await fetch(url);
      const data = (await res.json().catch(() => ({}))) as {
        jobs_results?: SerpJob[];
        error?: string;
      };
      if (data.error) {
        if (/invalid api key|unauthor/i.test(data.error))
          throw new Error("SerpApi: invalid api key");
        if (/run out|exceeded|limit|plan/i.test(data.error))
          throw new Error("SerpApi: quota exceeded");
        // Unsupported/invalid location → retry with a broader location.
        if (/location/i.test(data.error) && i < candidates.length - 1) continue;
        return []; // "no results" or final attempt
      }
      if (!res.ok) throw new Error(`SerpApi failed (${res.status})`);
      return Array.isArray(data.jobs_results) ? data.jobs_results : [];
    }
    return [];
  }

  const settled = await Promise.allSettled(roles.map(one));
  const fulfilled = settled.filter(
    (s): s is PromiseFulfilledResult<SerpJob[]> => s.status === "fulfilled",
  );
  if (fulfilled.length === 0) {
    const rej = settled.find((s) => s.status === "rejected");
    throw rej && rej.status === "rejected"
      ? rej.reason
      : new Error("SerpApi failed");
  }

  const seen = new Set<string>();
  const jobs: SerpJob[] = [];
  for (const j of fulfilled.flatMap((s) => s.value)) {
    const key = j.job_id || `${j.company_name}|${j.title}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    jobs.push(j);
  }

  const interns = jobs.filter(isInternship);
  const chosen = (interns.length > 0 ? interns : jobs).slice(0, count);
  const postings = chosen.map(mapSerpJob);
  const sources = Array.from(new Set(postings.map((p) => p.url).filter(Boolean)));
  return { postings, sources };
}

// ---- Source: JSearch (real-time Google for Jobs data) ----------------------

const JSEARCH_URL = "https://api.openwebninja.com/jsearch/search-v2";

interface JSearchJob {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  job_publisher?: string;
  job_apply_link?: string;
  job_google_link?: string;
  job_location?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_is_remote?: boolean;
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_period?: string;
  job_salary_currency?: string;
  job_description?: string;
  apply_options?: { publisher?: string; apply_link?: string }[];
}

function fmtSalary(j: JSearchJob): string {
  if (!j.job_min_salary && !j.job_max_salary) return "";
  const cur = j.job_salary_currency ? j.job_salary_currency + " " : "";
  const per = j.job_salary_period ? `/${j.job_salary_period.toLowerCase()}` : "";
  if (j.job_min_salary && j.job_max_salary)
    return `${cur}${j.job_min_salary}–${j.job_max_salary}${per}`;
  return `${cur}${j.job_min_salary ?? j.job_max_salary}${per}`;
}

function mapJSearchJob(j: JSearchJob): DiscoveredPosting {
  const loc =
    j.job_location ||
    [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ");
  return {
    company: j.employer_name || "Unknown",
    role: j.job_title || "",
    location: loc || "",
    workMode: j.job_is_remote ? "remote" : null,
    url: j.job_apply_link || j.job_google_link || "",
    salary: fmtSalary(j),
    source:
      (Array.isArray(j.apply_options) && j.apply_options[0]?.publisher) ||
      j.job_publisher ||
      "Google Jobs",
    summary: (j.job_description || "").replace(/\s+/g, " ").trim().slice(0, 180),
  };
}

async function discoverWithJSearch(
  roles: string[],
  location: string,
  keywords: string,
  country: string,
  count: number,
) {
  async function one(role: string) {
    const parts = [role, "intern", keywords].filter(Boolean).join(" ");
    const query = location ? `${parts} in ${location}` : parts;
    const url = new URL(JSEARCH_URL);
    url.searchParams.set("query", query);
    if (country) url.searchParams.set("country", country);
    url.searchParams.set("date_posted", "month");

    const res = await fetch(url, {
      headers: { "x-api-key": process.env.JSEARCH_API_KEY as string },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new Error("JSearch: invalid api key");
      if (res.status === 429) throw new Error("JSearch: quota exceeded");
      throw new Error(`JSearch failed (${res.status})`);
    }
    const data = (await res.json()) as { data?: { jobs?: JSearchJob[] } };
    return Array.isArray(data?.data?.jobs) ? data.data.jobs : [];
  }

  const settled = await Promise.allSettled(roles.map(one));
  const fulfilled = settled.filter(
    (s): s is PromiseFulfilledResult<JSearchJob[]> => s.status === "fulfilled",
  );
  if (fulfilled.length === 0) {
    const rej = settled.find((s) => s.status === "rejected");
    throw rej && rej.status === "rejected"
      ? rej.reason
      : new Error("JSearch failed");
  }

  // Dedupe by job id / apply link across roles.
  const seen = new Set<string>();
  const jobs: JSearchJob[] = [];
  for (const j of fulfilled.flatMap((s) => s.value)) {
    const key = j.job_id || j.job_apply_link || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    jobs.push(j);
  }

  const mapped = jobs.map(mapJSearchJob);
  // Prefer clearly-internship roles, but keep everything if that leaves nothing.
  const interns = mapped.filter((p) => /intern|placement|co-?op/i.test(p.role));
  const chosen = (interns.length > 0 ? interns : mapped).slice(0, count);
  const sources = Array.from(new Set(chosen.map((p) => p.url).filter(Boolean)));
  return { postings: chosen, sources };
}

// ---- Source: Jooble (job aggregator; covers Ireland and 60+ countries) -----

// Jooble uses country subdomains; a few differ from ISO codes.
const JOOBLE_HOST_OVERRIDE: Record<string, string> = { gb: "uk" };

interface JoobleJob {
  title?: string;
  location?: string;
  snippet?: string;
  salary?: string;
  source?: string;
  type?: string;
  link?: string;
  company?: string;
  updated?: string;
  id?: number | string;
}

function mapJoobleJob(j: JoobleJob): DiscoveredPosting {
  const text = `${j.title ?? ""} ${j.type ?? ""} ${j.location ?? ""}`;
  return {
    company: j.company || j.source || "Unknown",
    role: j.title || "",
    location: j.location || "",
    workMode: /remote|work from home/i.test(text) ? "remote" : null,
    url: j.link || "",
    salary: j.salary || "",
    source: j.source || "Jooble",
    summary: (j.snippet || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180),
  };
}

async function discoverWithJooble(
  roles: string[],
  location: string,
  keywords: string,
  country: string,
  count: number,
) {
  const sub = country ? JOOBLE_HOST_OVERRIDE[country] || country : "";
  const host = sub ? `https://${sub}.jooble.org` : "https://jooble.org";
  const endpoint = `${host}/api/${process.env.JOOBLE_API_KEY}`;

  async function one(role: string) {
    const keywordStr = [role, "intern", keywords].filter(Boolean).join(" ");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keywords: keywordStr,
        location,
        ResultOnPage: Math.min(count * 2, 20),
      }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new Error("Jooble: invalid api key");
      if (res.status === 429) throw new Error("Jooble: quota exceeded");
      throw new Error(`Jooble failed (${res.status})`);
    }
    const data = (await res.json()) as { jobs?: JoobleJob[] };
    return Array.isArray(data?.jobs) ? data.jobs : [];
  }

  const settled = await Promise.allSettled(roles.map(one));
  const fulfilled = settled.filter(
    (s): s is PromiseFulfilledResult<JoobleJob[]> => s.status === "fulfilled",
  );
  if (fulfilled.length === 0) {
    const rej = settled.find((s) => s.status === "rejected");
    throw rej && rej.status === "rejected"
      ? rej.reason
      : new Error("Jooble failed");
  }

  const seen = new Set<string>();
  const jobs: JoobleJob[] = [];
  for (const j of fulfilled.flatMap((s) => s.value)) {
    const key = String(j.id ?? j.link ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    jobs.push(j);
  }

  const mapped = jobs.map(mapJoobleJob);
  // Keep internship-ish roles; if none match, fall back to all so we show something.
  const interns = mapped.filter((p) =>
    /intern|placement|co-?op|trainee/i.test(p.role),
  );
  const chosen = (interns.length > 0 ? interns : mapped).slice(0, count);
  const sources = Array.from(new Set(chosen.map((p) => p.url).filter(Boolean)));
  return { postings: chosen, sources };
}

// ---- Fallback source: general web search (Tavily) + LLM structuring --------

function structurePrompt(
  roles: string[],
  location: string,
  keywords: string,
  count: number,
  findings: string,
  sources: string[],
) {
  const today = new Date().toISOString().slice(0, 10);
  const term = keywords.trim();
  const roleList = roles.map((r) => `"${r}"`).join(", ");
  return (
    `Today's date is ${today}. Extract up to ${count} distinct, real, currently-open ` +
    `internship postings matching ANY of these roles: ${roleList}` +
    `${location ? ` in ${location}` : ""}${term ? ` for: ${term}` : ""} ` +
    `from the web search findings below.\n\n` +
    `Rules:\n` +
    `- Use ONLY information present in the findings. NEVER invent a company, role, or URL.\n` +
    `  A company must be explicitly named in the findings to be included.\n` +
    `- Each "url" must be a real link that appears in the findings or source list. Use the\n` +
    `  most specific link available for that posting.\n` +
    `- Prefer direct company / applicant-tracking postings (Greenhouse, Lever, Ashby, Workday,\n` +
    `  company careers pages). A posting listed on a job board is fine IF a specific company\n` +
    `  and role are named in the findings.\n` +
    `- Each posting's role must reasonably match one of: ${roleList}.\n` +
    `- Do NOT output an entry for: how-to guides/articles, "best internships" lists, courses,\n` +
    `  degree/bootcamp programs, Wikipedia, tourism pages, YouTube, GitHub repos, or generic\n` +
    `  "N jobs in X" search pages that don't name a specific company + role.\n` +
    `- Skip clearly outdated or past-cycle postings; prefer current as of ${today}` +
    `${term ? ` and matching "${term}"` : ""}.\n` +
    `- If a field is unknown, use an empty string (or "unknown" for workMode).\n` +
    `- Deduplicate by company + role. Returning fewer than ${count} is fine, but DO include\n` +
    `  every genuine company posting you can identify in the findings.\n\n` +
    `FINDINGS:\n${findings}\n\n` +
    `SOURCE URLS:\n${sources.join("\n") || "(none reported)"}`
  );
}

function searchPrompt(
  roles: string[],
  where: string,
  keywords: string,
  modeText: string,
  count: number,
) {
  const term = keywords.trim();
  const roleList = roles.map((r) => `"${r}"`).join(", ");
  return (
    `Search the web for currently-open internship positions for any of these roles: ` +
    `${roleList} in ${where}${term ? ` (${term})` : ""}.${modeText} Find at least ` +
    `${count} distinct, real, currently-open postings with company, exact role title, ` +
    `location, work mode, the direct application URL, any listed pay, and the source ` +
    `site. Only include real, current postings you actually found — not old listings.`
  );
}

function dedupeSources(sources: unknown): string[] {
  const arr = Array.isArray(sources) ? sources : [];
  const urls = arr
    .map((s) =>
      s && typeof s === "object" && "url" in s
        ? (s as { url?: unknown }).url
        : undefined,
    )
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  return Array.from(new Set(urls));
}

async function structure(
  model: LanguageModel,
  roles: string[],
  location: string,
  keywords: string,
  count: number,
  findings: string,
  sources: string[],
) {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: postingSchema }),
    prompt: structurePrompt(
      roles,
      location,
      keywords,
      count,
      findings.slice(0, MAX_FINDINGS_CHARS),
      sources,
    ),
  });
  return normalize(output?.postings ?? []);
}

/** Free web search via Tavily (one query per role) -> Gemini structures the results. */
async function discoverWithTavily(
  roles: string[],
  location: string,
  keywords: string,
  modeText: string,
  count: number,
  structureModel: LanguageModel,
) {
  const remote = /remote/i.test(modeText) ? "remote" : "";

  async function tavilyQuery(query: string, max: number) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ query, search_depth: "advanced", max_results: max }),
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error("Tavily: invalid api key");
      if (res.status === 429 || res.status === 432)
        throw new Error("Tavily: quota exceeded");
      throw new Error(`Tavily search failed (${res.status})`);
    }
    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return data.results ?? [];
  }

  async function searchOne(role: string) {
    const base = [role, "internship", keywords, location, remote, "apply"]
      .filter(Boolean)
      .join(" ")
      .trim();
    // A second query biased toward direct company/ATS postings — plain job-board
    // searches alone tend to return generic "N jobs in X" list pages.
    const careers = [
      role,
      "internship",
      keywords,
      location,
      "(careers OR greenhouse.io OR lever.co OR myworkdayjobs.com OR ashbyhq.com OR gradireland.com)",
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const lists = await Promise.all([
      tavilyQuery(base, 7),
      tavilyQuery(careers, 7),
    ]);
    return lists.flat();
  }

  // Run all role searches in parallel; tolerate partial failures.
  const settled = await Promise.allSettled(roles.map(searchOne));
  const fulfilled = settled.filter(
    (s): s is PromiseFulfilledResult<Awaited<ReturnType<typeof searchOne>>> =>
      s.status === "fulfilled",
  );
  if (fulfilled.length === 0) {
    const firstRejection = settled.find((s) => s.status === "rejected");
    throw firstRejection && firstRejection.status === "rejected"
      ? firstRejection.reason
      : new Error("Tavily search failed");
  }

  const allResults = fulfilled.flatMap((s) => s.value);
  // Dedupe results by URL before building the findings text.
  const seen = new Set<string>();
  const results = allResults.filter((r) => {
    const u = r.url ?? "";
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  const findings = results
    .map(
      (r) =>
        `${r.title ?? ""}\n${r.url ?? ""}\n${(r.content ?? "").slice(0, 350)}`,
    )
    .join("\n\n");
  const sources = results.map((r) => r.url).filter((u): u is string => Boolean(u));

  const postings = await structure(
    structureModel,
    roles,
    location,
    keywords,
    count,
    findings,
    sources,
  );
  return { postings, sources };
}

/** Gemini with Google Search grounding (requires billing enabled on the project). */
async function discoverWithGemini(
  roles: string[],
  where: string,
  location: string,
  keywords: string,
  modeText: string,
  count: number,
) {
  const search = await generateText({
    model: google(GEMINI_MODEL),
    tools: { google_search: google.tools.googleSearch({}) },
    prompt: searchPrompt(roles, where, keywords, modeText, count),
  });
  const sources = dedupeSources(search.sources);
  const postings = await structure(
    google(GEMINI_MODEL),
    roles,
    location,
    keywords,
    count,
    search.text,
    sources,
  );
  return { postings, sources };
}

/** Vercel AI Gateway: Perplexity searches, Claude structures (usage-billed). */
async function discoverWithGateway(
  roles: string[],
  where: string,
  location: string,
  keywords: string,
  modeText: string,
  count: number,
) {
  const search = await generateText({
    model: GATEWAY_SEARCH_MODEL,
    prompt: searchPrompt(roles, where, keywords, modeText, count),
  });
  const sources = dedupeSources(search.sources);
  const postings = await structure(
    GATEWAY_STRUCTURE_MODEL,
    roles,
    location,
    keywords,
    count,
    search.text,
    sources,
  );
  return { postings, sources };
}

function toStringArray(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const s = String(item ?? "").trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out;
}

export async function POST(req: Request) {
  const hasSerp = Boolean(process.env.SERPAPI_API_KEY);
  const hasJSearch = Boolean(process.env.JSEARCH_API_KEY);
  const hasJooble = Boolean(process.env.JOOBLE_API_KEY);
  const hasGoogle = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const hasTavily = Boolean(process.env.TAVILY_API_KEY);
  const hasGateway = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL);
  const useGrounding = hasGoogle && process.env.GEMINI_USE_GROUNDING === "true";

  const tavilyStructureModel: LanguageModel | null = hasGoogle
    ? google(GEMINI_MODEL)
    : hasGateway
      ? GATEWAY_STRUCTURE_MODEL
      : null;

  const useTavily = hasTavily && Boolean(tavilyStructureModel);

  if (
    !hasSerp &&
    !hasJSearch &&
    !hasJooble &&
    !useTavily &&
    !useGrounding &&
    !hasGateway
  ) {
    return NextResponse.json(
      {
        error:
          "AI discovery isn't configured. Add a free SERPAPI_API_KEY (Google Jobs, best coverage) to .env.local — see README.",
        setup: true,
      },
      { status: 501 },
    );
  }

  let roles: string[] = [];
  let location = "";
  let keywords = "";
  let country = "";
  let workMode = "any";
  let count = 8;
  try {
    const body = await req.json();
    roles = toStringArray(body.roles ?? body.role).slice(0, MAX_ROLES);
    location = String(body.location ?? "").trim();
    keywords = toStringArray(body.keywords).join(", ").slice(0, 160);
    country = String(body.country ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 2);
    workMode = ["onsite", "remote", "hybrid"].includes(body.workMode)
      ? body.workMode
      : "any";
    count = Math.min(20, Math.max(3, Number(body.count) || 8));
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (roles.length === 0) {
    return NextResponse.json(
      { error: "Please add at least one role to search for." },
      { status: 400 },
    );
  }

  const where = location || "anywhere";
  const modeText = workMode === "any" ? "" : ` Prefer ${workMode} positions.`;

  try {
    let result;
    if (hasSerp || hasJSearch || hasJooble) {
      // Try each real-listings source in order, falling through when one is
      // empty: SerpApi (Google Jobs, best coverage incl. Ireland) -> JSearch
      // (Google for Jobs, US/UK/etc.) -> Jooble (aggregator).
      if (hasSerp) {
        try {
          result = await discoverWithSerpApi(
            roles,
            location,
            keywords,
            country,
            count,
          );
        } catch (e) {
          if (!hasJSearch && !hasJooble) throw e;
        }
      }
      if ((!result || result.postings.length === 0) && hasJSearch) {
        try {
          result = await discoverWithJSearch(
            roles,
            location,
            keywords,
            country,
            count,
          );
        } catch (e) {
          if (!hasJooble) throw e;
        }
      }
      if ((!result || result.postings.length === 0) && hasJooble) {
        result = await discoverWithJooble(
          roles,
          location,
          keywords,
          country,
          count,
        );
      }
      result = result ?? { postings: [], sources: [] };
    } else if (useTavily && tavilyStructureModel) {
      result = await discoverWithTavily(
        roles,
        location,
        keywords,
        modeText,
        count,
        tavilyStructureModel,
      );
    } else if (hasGateway) {
      result = await discoverWithGateway(
        roles,
        where,
        location,
        keywords,
        modeText,
        count,
      );
    } else {
      result = await discoverWithGemini(
        roles,
        where,
        location,
        keywords,
        modeText,
        count,
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("discover failed:", err);
    const raw = err instanceof Error ? err.message : "";
    let message = "The discovery agent hit an error. Please try again.";
    if (/serpapi: invalid/i.test(raw))
      message = "Your SerpApi key looks invalid — check SERPAPI_API_KEY.";
    else if (/serpapi: quota/i.test(raw))
      message = "SerpApi monthly search quota reached. It resets next month.";
    else if (/jsearch: invalid/i.test(raw))
      message = "Your JSearch API key looks invalid — check JSEARCH_API_KEY.";
    else if (/jsearch: quota/i.test(raw))
      message = "JSearch monthly request quota reached. It resets next month.";
    else if (/jooble: invalid/i.test(raw))
      message = "Your Jooble API key looks invalid — check JOOBLE_API_KEY.";
    else if (/jooble: quota/i.test(raw))
      message = "Jooble request quota reached. It resets next month.";
    else if (/tavily: invalid/i.test(raw))
      message = "Your Tavily API key looks invalid — check TAVILY_API_KEY.";
    else if (/tavily: quota/i.test(raw))
      message = "Tavily monthly search quota reached. It resets next month.";
    else if (/api key|unauthor|forbidden|credit|quota|permission|billing/i.test(raw))
      message =
        "AI request was rejected — check your API keys, quota, and (for grounding) billing.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
