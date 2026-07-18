import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { DiscoveredPosting } from "@/lib/discovery";
import type { WorkMode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Gemini (free AI Studio tier) with Google Search grounding is preferred.
const GEMINI_MODEL = "gemini-2.5-flash";
// Fallback: Vercel AI Gateway (usage-billed).
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

function searchPrompt(role: string, where: string, modeText: string, count: number) {
  return (
    `Search the web for currently-open "${role}" internship positions in ${where}.` +
    `${modeText} Find at least ${count} distinct, real, currently-open postings from ` +
    `company career pages and reputable job boards (LinkedIn, Indeed, Handshake, ` +
    `Greenhouse, Lever, etc.). For each posting, report: company, exact role title, ` +
    `location, work mode (onsite/remote/hybrid), the direct application/posting URL, ` +
    `any listed pay or stipend, and the source site. Only include real postings you ` +
    `actually found, and prefer official application links.`
  );
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
    `- Skip anything that is clearly not an internship for this role.\n\n` +
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

async function discoverWithGemini(
  role: string,
  where: string,
  location: string,
  modeText: string,
  count: number,
) {
  // 1) Search the live web via Google Search grounding.
  const search = await generateText({
    model: google(GEMINI_MODEL),
    tools: { google_search: google.tools.googleSearch({}) },
    prompt: searchPrompt(role, where, modeText, count),
  });
  const sources = dedupeSources(search.sources);

  // 2) Structure the findings (separate call — grounding + schema don't mix).
  const { output } = await generateText({
    model: google(GEMINI_MODEL),
    output: Output.object({ schema: postingSchema }),
    prompt: structurePrompt(role, location, count, search.text, sources),
  });

  return { postings: normalize(output?.postings ?? []), sources };
}

async function discoverWithGateway(
  role: string,
  where: string,
  location: string,
  modeText: string,
  count: number,
) {
  const search = await generateText({
    model: GATEWAY_SEARCH_MODEL,
    prompt: searchPrompt(role, where, modeText, count),
  });
  const sources = dedupeSources(search.sources);

  const { output } = await generateText({
    model: GATEWAY_STRUCTURE_MODEL,
    output: Output.object({ schema: postingSchema }),
    prompt: structurePrompt(role, location, count, search.text, sources),
  });

  return { postings: normalize(output?.postings ?? []), sources };
}

export async function POST(req: Request) {
  const useGemini = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const useGateway = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL);

  if (!useGemini && !useGateway) {
    return NextResponse.json(
      {
        error:
          "AI is not configured. Add a GOOGLE_GENERATIVE_AI_API_KEY (free) to .env.local — see README.",
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
    const result = useGemini
      ? await discoverWithGemini(role, where, location, modeText, count)
      : await discoverWithGateway(role, where, location, modeText, count);
    return NextResponse.json(result);
  } catch (err) {
    console.error("discover failed:", err);
    const message =
      err instanceof Error &&
      /api key|unauthor|forbidden|credit|quota|permission/i.test(err.message)
        ? "AI request was rejected — check your API key, quota, and available credit."
        : "The discovery agent hit an error. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
