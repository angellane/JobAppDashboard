# Internship Tracker

An interactive job application tracker for managing internship applications
(built for a Summer 2027 search). Track every application's status, priority,
and deadlines from one dashboard.

## Features

- **Pipeline stages** — Saved → Applied → Assessment → Interview → Offer, plus Rejected.
- **Kanban board** — drag cards between columns to update status.
- **Table view** — sortable list with inline status dropdowns.
- **Dashboard stats** — totals, active applications, response rate, interviews, offers.
- **Search & filters** — by text, status, and priority; sort by recent, priority, deadline, or company.
- **Deadline warnings** — highlights due-soon and overdue postings.
- **Rich records** — company, role, location, work mode, salary, source, contact, notes, URL.
- **Local persistence** — everything is saved in your browser's `localStorage`.
- **Export** — download all applications as JSON for backup.

## Getting started

```bash
npm install       # first time only
npm run dev       # start the dev server
```

Then open http://localhost:3000. The app seeds a few example rows on first
launch — edit or delete them freely.

### AI features (Discover)

The **Discover** page uses an AI agent to search the web for open internships.
Add an API key to `.env.local`:

```bash
cp .env.example .env.local   # then add ONE key
```

**Option A — fully free (recommended).** Web search via **Tavily** + structuring
via **Google Gemini**. Both keys are free and need no credit card:

```bash
# .env.local
TAVILY_API_KEY=your_tavily_key            # https://app.tavily.com (1,000 searches/mo)
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key   # https://aistudio.google.com/apikey
```

**Option B — Vercel AI Gateway (fallback, usage-billed).** Perplexity Sonar +
Claude; used only if the free keys above aren't set:

```bash
# .env.local
AI_GATEWAY_API_KEY=your_key_here
```

Restart `npm run dev` after adding keys.

> Note: a Gemini key **alone** can search the web only if you enable billing on
> the Google Cloud project — Google Search grounding is not on the pure free tier.
> That's why the free path pairs Gemini with Tavily for search.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — lint

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4.

## Roadmap

See [ROADMAP.md](ROADMAP.md). Next up: **AI automated applying** — an agent that
auto-applies to selected roles, and one that searches multiple web sources to
find relevant postings and add them to the tracker.
