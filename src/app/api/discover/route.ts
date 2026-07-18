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
    `from the search findings below.\n\n` +
    `Rules:\n` +
    `- Use ONLY information present in the findings. Do not invent postings or URLs.\n` +
    `- Each "url" must be a real link that appears in the findings or source list.\n` +
    `- Each posting's role must match one of: ${roleList}. Skip unrelated roles.\n` +
    `- Include ONLY genuine job postings. Skip: aggregator/list/search pages ("jobs in X",\n` +
    `  Glassdoor/Indeed/LinkedIn search result pages), degree programs, bootcamps, courses,\n` +
    `  and full-time (non-internship) roles.\n` +
    `- Skip postings that are clearly outdated or from a past hiring cycle. Prefer postings\n` +
    `  that are current as of ${today}${term ? ` and match "${term}"` : ""}.\n` +
    `- Prefer direct company or applicant-tracking (Greenhouse, Lever, Ashby, Workday) links.\n` +
    `- If a field is unknown, use an empty string (or "unknown" for workMode).\n` +
    `- Deduplicate by company + role. It is fine to return fewer than ${count} if few qualify.\n\n` +
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
  const perRole = Math.min(Math.max(count, 6), 12);

  async function searchOne(role: string) {
    const query = [
      role,
      "internship",
      keywords,
      location,
      /remote/i.test(modeText) ? "remote" : "",
      "apply",
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        search_depth: "advanced",
        max_results: perRole,
      }),
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

  if (!useTavily && !useGrounding && !hasGateway) {
    const error = hasGoogle
      ? "Almost there — you have a Gemini key. Add a free TAVILY_API_KEY (web search) to .env.local and restart. A Gemini key alone can't search the web without enabling billing."
      : "AI is not configured. Add a free TAVILY_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY to .env.local — see README.";
    return NextResponse.json({ error, setup: true }, { status: 501 });
  }

  let roles: string[] = [];
  let location = "";
  let keywords = "";
  let workMode = "any";
  let count = 8;
  try {
    const body = await req.json();
    roles = toStringArray(body.roles ?? body.role).slice(0, MAX_ROLES);
    location = String(body.location ?? "").trim();
    keywords = toStringArray(body.keywords).join(", ").slice(0, 160);
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
    if (useTavily && tavilyStructureModel) {
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
    if (/tavily: invalid/i.test(raw))
      message = "Your Tavily API key looks invalid — check TAVILY_API_KEY.";
    else if (/tavily: quota/i.test(raw))
      message = "Tavily monthly search quota reached. It resets next month.";
    else if (/api key|unauthor|forbidden|credit|quota|permission|billing/i.test(raw))
      message =
        "AI request was rejected — check your API keys, quota, and (for grounding) billing.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
