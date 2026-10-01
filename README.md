# LawAI — AI workspace for law firms (MVP)

LawAI is a practice-management workspace with an AI assistant that answers from **the firm's own data**: matters, hearings, deadlines, clients, and the full text of every document, with clause-level citations. A lawyer can ask *"When is my next hearing?"*, *"What does the Johnson MSA say about liability?"* or *"What's the deadline to answer a complaint served today in New York?"* and get an answer grounded in the database, never guessed.

Everything in the UI is live data from Postgres. The seed script creates a realistic demo firm, and every screen supports full create / update / delete.

---

## What's in the MVP

| Area | What works |
|---|---|
| **Dashboard** | KPIs with period-over-period deltas, recent matters ordered by next event, today's agenda, computed insights, recent documents, "Ask LawAI" box |
| **AI Assistant** | Streaming chat with tool use over cases, calendar, tasks, clients, documents, playbook issues, legal sources and deadline rules. Inline citations `[S1]` link to the exact clause. Scope to one matter or one document. Chat / Draft / Research modes. Saved conversations, thumbs up/down feedback |
| **Cases** | Filterable, paginated list, matter detail (overview, events, tasks, documents, team, activity log), create/edit, staffing, time logging |
| **Clients** | List, detail with matters, contacts and activity, create/edit |
| **Documents** | Upload PDF/DOCX/TXT/MD, automatic RAG ingestion, text viewer, **AI playbook review** (flags clauses against firm rules, verifies quotes verbatim, one-click accept creates a new version and re-indexes), AI drafting into the document, download |
| **Drafting** | Documents in review plus new AI-drafted documents |
| **Legal research** | Hybrid search over a legal-sources library filtered by jurisdiction, with a cited AI answer; query history |
| **Tasks & deadlines** | Month calendar, grouped task list, complete/reopen, new tasks and events, **court-deadline calculator** driven by rules in the DB (weekend roll-forward) |
| **Reports** | Quarter / last quarter / YTD: billable hours trend, practice-area mix, team utilisation, AI usage and hours saved |
| **Settings** | Profile, firm jurisdictions, add/remove playbook rules, AI time-saved assumptions |
| **Security** | DB-backed sessions (hashed tokens, httpOnly cookie), bcrypt passwords, **matter-level access control applied to every query, page, file download and AI tool**, audit log, security headers |

---

## Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16** (App Router, Server Components, Server Actions), React 19, TypeScript | UI, auth, CRUD and conversation storage |
| AI service | **Python 3.12 + FastAPI** in [`ai/`](ai) | Parsing, chunking, embeddings, hybrid retrieval, the agent and its tools, review, drafting, research and the ingestion CLI. Python is where OCR, document-layout, evaluation and data-pipeline tooling lives |
| Styling | Tailwind CSS v4 | Design tokens from the LawAI design system live in `globals.css` |
| Database | **PostgreSQL 16 + pgvector** via **Drizzle ORM** | One database for relational data, vectors and full-text search, so permission filters and retrieval run in the same SQL query. No separate vector DB to secure or sync |
| LLM | **Anthropic Claude** (Sonnet for chat/review/drafting, Haiku for ingestion); **Groq** for local testing (`LLM_PROVIDER=groq`) | Strong long-document reasoning, tool use, prompt caching |
| Embeddings | **Voyage `voyage-law-2`** (+ `rerank-2`) | Embedding model trained on legal text. OpenAI is a drop-in alternative |
| Files | S3-compatible (Cloudflare R2 / AWS S3 / Supabase Storage) or local disk | |
| Hosting | Vercel (Next.js + Python as Vercel Services in one project) + Neon/Supabase + R2, **or** Docker on any VM | |

### The RAG pipeline (the "advanced" part)

1. **Parse.** `pypdf` for PDF (keeps page boundaries so citations show page numbers), `mammoth` for DOCX.
2. **Structure-aware chunking.** Splits on clause numbers and headings (`14.2`, `ARTICLE IV`, `Schedule 1`), not fixed windows. Max 2,400 chars, 400-char overlap, tiny sections merged.
3. **Contextual Retrieval.** Claude Haiku writes a one-line note per chunk ("This is the liability cap in the Johnson MSA…"), with the full document prompt-cached so it is cheap. This fixes the classic RAG failure where a chunk says "the Supplier" but never names the contract.
4. **Embed** with `voyage-law-2` (1024-dim) into a pgvector **HNSW** index.
5. **Hybrid retrieval.** Vector cosine search **plus** Postgres full-text search (exact terms such as "clause 9.2" or "CPLR 213"), fused with **Reciprocal Rank Fusion**, with a boost when the query names a clause number.
6. **Rerank** the top candidates with Voyage `rerank-2`.
7. **Permission filter inside SQL.** A user can only ever retrieve chunks from matters they are staffed on.
8. **Cited generation.** Every retrieved passage is registered as `S1, S2…`; the model must cite inline, and the UI turns citations into clickable chips that open the document at that clause.

Structured questions (hearings, deadlines, clients) are answered through **tools that query the database**, not through vector search, so dates and names are exact. Full detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### How the two services fit

```
Browser ──► Next.js (UI, auth, CRUD, conversations) ──► Python AI service (ai/) ──► Postgres + pgvector
                 │  sends only the user id + INTERNAL_API_TOKEN       │ re-derives the user's matters from the DB
                 └──────────────── same Postgres (Drizzle owns the schema) ◄┘
```

The AI service is never called from the browser. On Vercel it has no public route at all; Next.js reaches it through a service binding (`AI_SERVICE_URL`), and every call still carries the shared `INTERNAL_API_TOKEN`.

---

## Run it locally

Requirements: Node.js 22.9+, [uv](https://docs.astral.sh/uv/) (installs Python 3.12 for you), Docker (for Postgres).

```bash
cp .env.example .env              # add an LLM key, VOYAGE_API_KEY, and a random INTERNAL_API_TOKEN (openssl rand -hex 32)
docker compose up -d db           # Postgres 16 + pgvector on :5432
npm install
npm run ai:install                # Python deps into ai/.venv
npm run db:setup                  # extensions + schema
npm run db:seed                   # demo firm, matters, documents; then indexes everything (Python)

npm run ai:dev                    # terminal 1: AI service on http://127.0.0.1:8000
npm run dev                       # terminal 2: http://localhost:3000
```

**Demo logins** (password `demo1234` for all):

| Email | Role | Sees |
|---|---|---|
| `john@demo.law` | Admin / Senior Attorney | All 11 matters |
| `aisha@demo.law` | Associate | Her matters only |
| `priya@demo.law`, `daniel@demo.law` | Associates | Their matters |
| `sam@demo.law` | Paralegal | 2 matters (ask the assistant about *Mehta* to demo access control) |

**API keys**

- LLM (required for AI). Production: `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (https://console.anthropic.com). Testing: `LLM_PROVIDER=groq` + `GROQ_API_KEY` (https://console.groq.com); models default to `openai/gpt-oss-120b` / `openai/gpt-oss-20b`. Keep `RAG_CONTEXTUAL=false` on Groq's free tier; it sends the whole document once per chunk.
- `VOYAGE_API_KEY` (recommended): https://www.voyageai.com. Without it, retrieval automatically falls back to Postgres full-text search. Everything still works; recall on paraphrased questions is lower.
- After adding keys to an existing database, re-index: `npm run ingest:pending -- --all`

Without any keys the whole app runs; AI features show a "configure your key" notice.

### Useful scripts

| Command | Does |
|---|---|
| `npm run db:reset` | Drop everything, recreate, reseed (seed dates are relative to today, so the demo always looks current) |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run ingest:pending` | Retry failed/pending ingestion (`-- --all` re-indexes every document) |
| `npm run ai:index` | Embed the legal-sources library, then ingest pending documents |
| `npm run ai:test` | Python tests (chunking, fusion, deadlines, provider message translation) |
| `npm run lint` | Type-check |
| `npm run build && npm start` | Production build and server |

---

## Deploy

### Option A — Vercel + Neon + Cloudflare R2 (recommended for the pitch)

1. **Database:** create a Neon (or Supabase) project. pgvector is available on both. Copy the connection string into `DATABASE_URL` (pooled URLs are fine; the driver disables prepared statements).
2. **Storage:** create an R2 bucket and an API token. Set `S3_BUCKET`, `S3_ENDPOINT` (`https://<account>.r2.cloudflarestorage.com`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION=auto`.
3. From your machine, with `DATABASE_URL` pointing at the cloud DB: `npm run db:setup && npm run db:seed`.
4. Import the repo in Vercel, add every variable from `.env.example` **except `AI_SERVICE_URL`** (the service binding injects it), set `APP_URL` to the production URL, and set random values for `CRON_SECRET` and `INTERNAL_API_TOKEN`.
5. Deploy. `vercel.json` defines two Vercel Services that ship together in every deployment: `web` (Next.js, public) and `ai` (FastAPI in `ai/`, private, reachable only through the binding). It also registers a daily cron that retries stuck ingestion. On Vercel Pro you can run it every 10 minutes (`*/10 * * * *`). Long AI routes declare `maxDuration` up to 300 s; this needs Vercel Pro (Hobby caps at 60 s).

### Option B — Docker on any VM (AWS, GCP, DigitalOcean, an on-prem server)

```bash
cp .env.example .env              # add keys
docker compose up -d db
docker compose --profile tools run --rm setup      # schema + demo data
docker compose --profile tools run --rm ai-index   # chunk + embed (Python)
docker compose up -d ai app       # http://<server>:3000
```

Put Caddy or Nginx in front for HTTPS. Files persist in the `storage` volume (or set `S3_*` to use object storage). For production data, use a managed Postgres with backups instead of the bundled container.

**Data residency (India):** for Indian firms, run Postgres and storage in an India region (Neon/Supabase/AWS `ap-south-1` Mumbai) and review Anthropic/Voyage data-processing terms for client confidentiality and DPDP Act obligations.

---

## Project layout

```
src/
  app/
    (app)/            authenticated screens: dashboard, assistant, cases, clients,
                      documents, drafting, research, tasks, reports, settings, search
    api/              chat (NDJSON stream), documents upload/file/review, draft,
                      research, cron/ingest
    actions/          server actions (all CRUD, with revalidation + audit log)
    login/
  components/         UI kit, navigation, forms, uploader
  db/schema.ts        23 tables (Drizzle)
  lib/
    ai/               agent loop, tools, review, drafting, research
    rag/              parse, chunk, contextualize, embeddings, ingest, search
    queries/          read models for each screen
    access.ts         matter-level permission helpers
    auth.ts           sessions
    deadlines.ts      court-deadline engine
scripts/              setup-db, seed, seed-documents, reset-db, ingest-pending
docs/ARCHITECTURE.md
```

---

## Known MVP limits (and the roadmap)

- **Scanned PDFs** need OCR before ingestion (add AWS Textract, Google Document AI or Tesseract in `lib/rag/parse.ts`).
- **Legal-sources library** is a small seeded set. For production, license real data: CourtListener (US), Indian Kanoon API and SCC Online (India), The National Archives Find Case Law (UK), and commercial providers. Never present AI research as verified without a citation check.
- **Deadline calculator** rolls weekends forward but has no court-holiday calendar yet.
- **Ingestion** runs in `after()` with a cron retry; move to a queue (Inngest, Trigger.dev, SQS) for high volume.
- Not yet: SSO/SAML, MFA, email/Outlook sync, e-signature, billing/invoicing, conflict checks, mobile app, evaluation harness for answer quality.

LawAI drafts and research are aids for qualified lawyers and are not legal advice.
