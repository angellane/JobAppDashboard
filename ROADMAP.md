# JobAppDashboard — Roadmap

## Phase 1 — Tracker (in progress)
Interactive job application tracker to manage internship applications for Summer 2027.
- [x] Data model + local persistence (localStorage)
- [x] Application list/table with status tracking
- [x] Add / edit / delete applications
- [x] Dashboard stats + search/filter
- [x] Kanban pipeline board (drag-and-drop)
- [x] "Needs attention" reminders (deadlines, stale applications, high-priority saved roles)
- [x] Insights view (conversion rates, pipeline, weekly activity, by source/priority)
- [x] JSON import/restore (pairs with export)
- [x] View persistence + keyboard shortcut (N = add)
- [x] Profile page: résumé/CV upload + server-side text extraction (PDF/DOCX/TXT),
      structured fields, work authorization, reusable common answers
- [ ] Optional: move persistence to a database (Neon/Postgres) for multi-device sync

### Résumé handling (done — feeds Phase 2)
- Résumé file stored client-side in IndexedDB; metadata + extracted text in localStorage.
- `/api/parse-resume` extracts plain text server-side (pdf-parse / mammoth).
- Heuristic "auto-fill contact info" from the extracted text (email/phone/LinkedIn/GitHub).
  Phase 2 replaces this with LLM extraction that maps the whole CV into structured fields.

## Phase 2 — AI automated applying (planned)
Features requested by the user, to be built after the tracker is solid:

1. **AI auto-apply for specific roles.**
   Given a role the user has saved/marked, an AI agent fills out and submits the
   application on their behalf (using the user's profile, resume, and answers to
   common questions).

2. **AI multi-source discovery + auto-apply.**
   An AI agent searches across multiple job sources on the web (LinkedIn, company
   career pages, job boards, etc.), finds relevant internship postings matching the
   user's criteria, adds them to the tracker, and can then automatically apply to
   the ones the user approves.

3. **LLM résumé extraction.**
   Replace the heuristic auto-fill with an LLM that reads the extracted CV text and
   populates the full structured profile (experience, education, skills, dates), which
   the auto-apply agent then uses to answer application questions accurately.

### Implementation notes for Phase 2 (for later)
- Store a user "profile" (resume, common Q&A, links, work authorization, etc.).
- Use a headless browser / agentic tool for form filling (e.g. Vercel Sandbox +
  Playwright, or a browser-automation service). Requires per-site handling + CAPTCHAs.
- Use web search / crawling + an LLM to parse postings into the Application schema.
- Add a human-in-the-loop approval step before any submission.
- Respect site ToS and rate limits; keep an audit log of automated actions.
