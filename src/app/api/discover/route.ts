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
  role: string,
  location: string,
  count: number,
  findings: string,
  sources: string[],
) {
  return (
    `From the internship search findings below, extract up to ${count} distinct ` +
    `real postings for "${role}"${location ? ` in ${location}` : ""}.\n\n` +
    `Rules:\n` +
    `- Use ONLY information present in the findings. Do not invent postings or URLs.\n` +
    `- Each "url" must be a real link that appears in the findings or source list.\n` +
    `- If a field is unknown, use an empty string (or "unknown" for workMode).\n` +
    `- Deduplicate by company + role.\n` +
    `- Skip anything that is clearly not an internship for this role (e.g. list pages,\n` +
    `  "jobs in X" aggregators, or full-time roles).\n\n` +
    `FINDINGS:\n${findings}\n\n` +
    `SOURCE URLS:\n${sources.join("\n") || "(none reported)"}`
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
  role: string,
  location: string,
  count: number,
  findings: string,
  sources: string[],
) {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: postingSchema }),
    prompt: structurePrompt(role, location, count, findings, sources),
  });
  return normalize(output?.postings ?? []);
}

/** Free web search via Tavily -> Gemini (free) structures the results. */
async function discoverWithTavily(
  role: string,
  location: string,
  modeText: string,
  count: number,
  structureModel: LanguageModel,
) {
  const query = [role, "internship", location, /remote/i.test(modeText) ? "remote" : ""]
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
      search_depth: "basic",
      max_results: Math.min(count + 3, 12),
    }),
  });

  if (!res.ok) {
    const status = res.status;
    if (status === 401) throw new Error("Tavily: invalid api key");
    if (status === 429 || status === 432)
      throw new Error("Tavily: quota exceeded");
    throw new Error(`Tavily search failed (${status})`);
  }

  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  const results = data.results ?? [];
  const findings = results
    .map(
      (r) =>
        `${r.title ?? ""}\n${r.url ?? ""}\n${(r.content ?? "").slice(0, 350)}`,
    )
    .join("\n\n");
  const sources = results.map((r) => r.url).filter((u): u is string => Boolean(u));

  const postings = await structure(
    structureModel,
    role,
    location,
    count,
    findings,
    sources,
  );
  return { postings, sources };
}

/** Gemini with Google Search grounding (requires billing enabled on the project). */
async function discoverWithGemini(
  role: string,
  where: string,
  location: string,
  modeText: string,
  count: number,
) {
  const search = await generateText({
    model: google(GEMINI_MODEL),
    tools: { google_search: google.tools.googleSearch({}) },
    prompt:
      `Search the web for currently-open "${role}" internship positions in ${where}.` +
      `${modeText} Find at least ${count} distinct, real, currently-open postings with ` +
      `company, exact role title, location, work mode, the direct application URL, any ` +
      `listed pay, and the source site. Only include real postings you actually found.`,
  });
  const sources = dedupeSources(search.sources);
  const postings = await structure(
    google(GEMINI_MODEL),
    role,
    location,
    count,
    search.text,
    sources,
  );
  return { postings, sources };
}

/** Vercel AI Gateway: Perplexity searches, Claude structures (usage-billed). */
async function discoverWithGateway(
  role: string,
  where: string,
  location: string,
  modeText: string,
  count: number,
) {
  const search = await generateText({
    model: GATEWAY_SEARCH_MODEL,
    prompt:
      `Search the web for currently-open "${role}" internship positions in ${where}.` +
      `${modeText} Find at least ${count} distinct, real, currently-open postings with ` +
      `company, exact role title, location, work mode, the direct application URL, any ` +
      `listed pay, and the source site. Only include real postings you actually found.`,
  });
  const sources = dedupeSources(search.sources);
  const postings = await structure(
    GATEWAY_STRUCTURE_MODEL,
    role,
    location,
    count,
    search.text,
    sources,
  );
  return { postings, sources };
}

export async function POST(req: Request) {
  const hasGoogle = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const hasTavily = Boolean(process.env.TAVILY_API_KEY);
  const hasGateway = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL);

  // Which structuring model can we use for the Tavily path?
  const tavilyStructureModel: LanguageModel | null = hasGoogle
    ? google(GEMINI_MODEL)
    : hasGateway
      ? GATEWAY_STRUCTURE_MODEL
      : null;

  if (!(hasTavily && tavilyStructureModel) && !hasGoogle && !hasGateway) {
    return NextResponse.json(
      {
        error:
          "AI is not configured. Add a free GOOGLE_GENERATIVE_AI_API_KEY and TAVILY_API_KEY to .env.local — see README.",
        setup: true,
      },
      { status: 501 },
    );
  }

  let role = "";
  let location = "";
  let workMode = "any";
  let count = 8;
  try {
    const body = await req.json();
    role = String(body.role ?? "").trim();
    location = String(body.location ?? "").trim();
    workMode = ["onsite", "remote", "hybrid"].includes(body.workMode)
      ? body.workMode
      : "any";
    count = Math.min(20, Math.max(3, Number(body.count) || 8));
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json(
      { error: "Please provide a role to search for." },
      { status: 400 },
    );
  }

  const where = location || "anywhere";
  const modeText = workMode === "any" ? "" : ` Prefer ${workMode} positions.`;

  try {
    let result;
    if (hasTavily && tavilyStructureModel) {
      result = await discoverWithTavily(
        role,
        location,
        modeText,
        count,
        tavilyStructureModel,
      );
    } else if (hasGoogle) {
      result = await discoverWithGemini(role, where, location, modeText, count);
    } else {
      result = await discoverWithGateway(role, where, location, modeText, count);
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
