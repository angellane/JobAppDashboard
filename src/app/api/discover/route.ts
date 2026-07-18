import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const SEARCH_MODEL = "perplexity/sonar-pro"; // live web search + citations
const STRUCTURE_MODEL = "anthropic/claude-sonnet-5"; // reliable structured output

const postingSchema = z.object({
  postings: z.array(
    z.object({
      company: z.string().describe("Hiring company name"),
      role: z.string().describe("Exact job/role title"),
      location: z.string().describe("City, State/Country, or 'Remote'"),
      workMode: z
        .enum(["onsite", "remote", "hybrid"])
        .nullable()
        .describe("null if not stated"),
      url: z
        .string()
        .describe("Direct application or posting URL taken from the findings"),
      salary: z.string().describe("Pay/stipend if stated, else empty string"),
      source: z.string().describe("Source site, e.g. LinkedIn, company careers"),
      summary: z.string().describe("One short line on why it matches the search"),
    }),
  ),
});

function hasCredentials(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL);
}

export async function POST(req: Request) {
  if (!hasCredentials()) {
    return NextResponse.json(
      {
        error:
          "AI is not configured. Add an AI_GATEWAY_API_KEY to .env.local (see README) or deploy on Vercel.",
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
  const modeText =
    workMode === "any" ? "" : ` Prefer ${workMode} positions.`;

  try {
    // 1) Search the web for live postings.
    const search = await generateText({
      model: SEARCH_MODEL,
      prompt:
        `Search the web for currently-open "${role}" internship positions in ${where}.` +
        `${modeText} Find at least ${count} distinct, real, currently-open postings from ` +
        `company career pages and reputable job boards (LinkedIn, Indeed, Handshake, ` +
        `Greenhouse, Lever, etc.). For each posting, report: company, exact role title, ` +
        `location, work mode (onsite/remote/hybrid), the direct application/posting URL, ` +
        `any listed pay or stipend, and the source site. Only include real postings you ` +
        `actually found, and prefer official application links.`,
    });

    const sources = Array.from(
      new Set(
        (search.sources ?? [])
          .map((s) => (s as { url?: string }).url)
          .filter((u): u is string => Boolean(u)),
      ),
    );

    // 2) Structure the findings into tracker-ready postings.
    const { output } = await generateText({
      model: STRUCTURE_MODEL,
      output: Output.object({ schema: postingSchema }),
      prompt:
        `From the internship search findings below, extract up to ${count} distinct ` +
        `real postings for "${role}"${location ? ` in ${location}` : ""}.\n\n` +
        `Rules:\n` +
        `- Use ONLY information present in the findings. Do not invent postings or URLs.\n` +
        `- Each "url" must be a real link that appears in the findings or source list.\n` +
        `- If a field is unknown, use an empty string (or null for workMode).\n` +
        `- Deduplicate by company + role.\n` +
        `- Skip anything that is clearly not an internship for this role.\n\n` +
        `FINDINGS:\n${search.text}\n\n` +
        `SOURCE URLS:\n${sources.join("\n") || "(none reported)"}`,
    });

    const postings = output?.postings ?? [];
    return NextResponse.json({ postings, sources });
  } catch (err) {
    console.error("discover failed:", err);
    const message =
      err instanceof Error && /api key|unauthor|forbidden|credit|quota/i.test(err.message)
        ? "AI request was rejected — check your AI_GATEWAY_API_KEY and available credit."
        : "The discovery agent hit an error. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
