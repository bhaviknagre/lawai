# LawAI production tech stack

Status: **proposal for owner review** (written 2026-10-19). Nothing here is approved or built. Every choice below is a recommendation with a stated alternative, and the unvalidated ones are listed as assumptions in section 6.

Scope: take LawAI from "working MVP on Vercel" to "safe to put real client data in", and carry the sixteen planned features in [SPEC.md](../SPEC.md) (India first, not India only). Team assumption: 2 to 4 engineers, cost-aware, prefer managed and Vercel-native services.

Reading guide: section 1 is the answer in one table, section 5 is the ordered to-do list, section 6 is what the owner has to decide. Everything else is the reasoning and the evidence.

Prices were read from vendor pages on 2026-10-19 (links in the appendix). Where a vendor page was unclear or only a third party reported a number, the text says so. Monthly estimates assume a **pilot of about 5 firms, 50 users, 5,000 documents, 20,000 AI queries a month**, and are rounded; they are planning numbers, not quotes.

---

## 1. Summary: the recommended stack

| Layer | Choice | Why | Alternative considered | Est. $/month (pilot) |
|---|---|---|---|---|
| Frontend | Keep Next.js 16 + React 19 + Tailwind 4. Add `next/font` Noto Sans Devanagari, a pdf.js viewer (OCR correction, clause jump), `next-intl` later. Client portal is a route group on its own subdomain | Already built and working; the gaps are product features, not framework | Separate SPA for the portal (more to deploy, no gain) | in hosting |
| Hosting / compute | Vercel Pro, Fluid Compute, functions pinned to the DB region | Already deployed; Services model fits Next.js + Python; no ops | AWS ECS/Fargate (more control, far more ops) | 60-80 |
| Backend / API | Next.js route handlers + Server Actions as a modular monolith; a tenant-aware data-access layer (`withTenant`) in front of Drizzle | Smallest moving parts; RLS needs one choke point for DB access | Split API service (premature) | in hosting |
| AI service | Keep FastAPI (`ai/`) as a Vercel Service; add a second container service `render` for PDF | Python is where OCR, layout and eval tooling live; container isolates native libs | Move AI into Node (loses Python tooling) | 10-25 |
| LLM gateway + routing | Vercel AI Gateway (zero markup) behind `llm.py`; tiers `fast` / `chat` / `reason`; Groq open-weight models as the cheap default, a frontier model as fallback and for review/drafting; zero-data-retention enforced | One place for fallbacks, budgets and request logs; keeps the neutral message format already in `llm.py` | LiteLLM self-hosted (an extra service to run); direct provider SDKs only (no failover) | 80-200 tokens |
| RAG + embeddings | Keep Postgres + pgvector HNSW + FTS + RRF + rerank. Replace the English-only embedding model with a multilingual one chosen by a 1-day bake-off (default `voyage-4`, 1024-dim) | One store keeps permission filters and retrieval in one SQL statement (RULE-3) | Separate vector DB (rejected: splits the permission filter) | 15-40 |
| OCR (Hindi + English) | Sarvam Vision as primary, Google Document AI Enterprise OCR as fallback, Tesseract `hin+eng` for local dev only; decided by a bake-off on 30 real scans | Indic-specialist, India-hosted, about Rs 0.5 per page | Mistral OCR (about $4 per 1,000 pages, Hindi unconfirmed), AWS Textract and Azure Vision (scored near zero on Indic text in Sarvam's own vendor benchmark, so unproven) | 20-60 |
| Database | Neon Postgres: two projects (`prod`, `nonprod`), branch per PR, PITR, Row-Level Security, Singapore region now, India-resident path later | Branching solves "no dev/staging"; Drizzle and postgres-js stay portable | Supabase Mumbai, Aurora Postgres Mumbai (see 3.6) | 55-110 prod, 10-20 nonprod |
| File storage | Vercel Blob private store for documents; S3 `ap-south-1` with Object Lock only for backups and audit anchors | Already coded in `src/lib/storage.ts`; Blob is cheap and native | Cloudflare R2 (no India region story), S3 for everything | 5-15 |
| Jobs / queues / schedule | Vercel Workflow (durable steps) for ingestion, OCR, briefs and pack refresh; Vercel Queues for simple fan-out; Vercel Cron as the clock; all behind a thin `jobs/` interface | Replaces `after()` + retry cron with retries, resume and idempotency, no new vendor | Inngest or Trigger.dev (second vendor), Redis + ARQ or Temporal (more ops) | 5-25 |
| Auth | Better Auth on the same Postgres: TOTP MFA + backup codes now, SSO plugin (SAML/OIDC) when asked; client portal is a separate principal with its own table, cookie and auth instance | Open source, no per-user fee, keeps users in our DB and region | WorkOS ($125 per SSO connection per month), Clerk, Auth0 | 0 |
| Email / notifications | Resend (already coded) on a verified own domain, SES `ap-south-1` as second provider later; in-app notifications stay | `src/lib/email.ts` already exists; the missing piece is configuration | SES only (more setup), Postmark | 20 |
| WhatsApp / SMS (proposed, Features 11 and 16) | WhatsApp Business Platform through an Indian provider (utility templates) and a DLT-registered Indian SMS provider; send from an hourly Vercel Cron through a Queue; delivery log in Postgres | Clients and staff in India act on WhatsApp and SMS; Meta and TRAI approvals gate the rollout | Email and in-app only until approvals land | about 3-10 at pilot volume (unverified) |
| Payments / billing | Razorpay Subscriptions for INR; invoices-by-link first; international card or USD later via Razorpay international or a merchant of record | Stripe's India page was "request an invite" on 2026-10-19; Razorpay supports UPI/e-mandate | Stripe India, Paddle/Dodo | % of revenue |
| Observability | Sentry (errors, traces) + Vercel Observability + a Postgres `llm_calls` ledger (cost, latency, prompt version, scope hash); no client text sent to any vendor | Meets "can it prove how it got there" without leaking content | Langfuse Cloud (content leaves our region), Datadog (cost) | 30-60 |
| Security / compliance | Postgres RLS, hash-chained append-only access log, Vercel WAF rate limits, CSP/HSTS, MFA, ZDR for LLMs, DPA + sub-processor list | Maps directly to RULE-3, FR-21..25, DPDP | Self-built WAF (no) | 0-15 |
| CI/CD + environments | GitHub Actions + Vercel + Neon branch per PR; local, preview, staging, production; committed SQL migrations | Gives every PR an isolated database without touching production | Manual deploys (current) | 0-20 |
| Testing | Vitest, pytest, Playwright, plus an eval harness (golden sets) gating prompt/model/retrieval changes | The product's value is trust, so quality needs a regression gate | Manual checks (current) | 5-20 |
| Document export | WeasyPrint in a container service (HTML/CSS paged media, `target-counter` for Table of Authorities page numbers), `python-docx` for DOCX | CSS page-number references make TOA numbers match the render (NFR-20) | Headless Chromium + Paged.js (heavier), client-side PDF | 5-10 |

**Pilot total: about $350 to $650 a month, central estimate about $450**, before payment-gateway fees and before any enterprise SSO connections. The largest lines are Vercel seats, the production database and LLM tokens.

**Three calls that matter most**

1. Fix environments first: production data must not be reachable from a laptop, and every PR gets its own database branch (Phase 0).
2. Keep the "one Postgres" design, and add Row-Level Security as a backstop under the hand-written access filters.
3. Spend the complexity budget on the trust features (citation verification, audit log), not on new infrastructure. Use platform-native pieces (Workflow, Queues, Blob, AI Gateway, Neon branches) wherever one fits.

---

## 2. The current stack: keep, change, add

### 2.1 Keep (it is right, and the evidence says it works)

| Piece | Evidence | Note |
|---|---|---|
| Next.js 16, React 19, Tailwind 4, TypeScript | `package.json` | Follow `node_modules/next/dist/docs/` for any change (AGENTS.md says this Next.js has breaking changes, for example `src/proxy.ts` replaces middleware) |
| FastAPI AI service as a private Vercel Service | `vercel.json` (`services.ai`, service binding to `AI_SERVICE_URL`), `ai/main.py` | Never browser-reachable; keep |
| Postgres + pgvector + Drizzle, `firm_id` on every row | `src/db/schema.ts`, `docs/ARCHITECTURE.md` section 2 | Portable driver (`postgres` / `psycopg`), no vendor SDK lock-in |
| Hybrid retrieval: HNSW + FTS + RRF + rerank, permission filter in SQL | `ai/lawai_ai/rag/search.py`, `chunks_embedding_idx` in schema | Same "one store" idea the reference document argues for (section 7) |
| Matter-level access control in app and AI service | `src/lib/access.ts`, `ai/lawai_ai/access.py` | Becomes the first line; RLS becomes the second |
| Provider-neutral LLM message format | `ai/lawai_ai/llm.py` | The seam for the gateway |
| Verbatim quote verification | `ai/lawai_ai/review.py` | Seed of Feature 1 |
| Hashed session tokens, httpOnly cookie, timing-safe login | `src/lib/auth.ts` | Good base; moves into Better Auth with the same properties |
| Storage abstraction (S3, Blob, disk) | `src/lib/storage.ts` | Keep the abstraction, standardise on Blob for documents |
| Resend client already written | `src/lib/email.ts` | The gap is configuration, not code |
| Security headers | `next.config.ts` | Add CSP and HSTS (not present) |
| Pytest suite for chunking, search, deadlines, LLM translation | `ai/tests/` | Extend, do not replace |

### 2.2 Change (each item is a gap with proof in the repo)

| # | Problem | Evidence | Fix |
|---|---|---|---|
| C1 | **Local dev points at the production database.** Next.js loads `.env.local`, whose `DATABASE_URL` is a Neon pooler host (`ep-...-pooler.c-13.us-east-1.aws.neon.tech`), while `.env` points at localhost. So `npm run dev` runs against production, and the Python service (which reads only `.env`) runs against a different database | `.env.local`, `.env`, `ai/lawai_ai/config.py` | Separate Neon projects, pull dev credentials per environment, rotate the production password (3.14) |
| C2 | **No migrations.** `db:setup` runs `drizzle-kit push --force`; `drizzle.config.ts` has `out: "./drizzle"` but no `drizzle/` directory exists | `package.json`, `drizzle.config.ts` | `drizzle-kit generate`, commit SQL, apply with `migrate`; ban `push` for shared databases |
| C3 | **Destructive-script guard is weak.** `scripts/reset-db.ts` only refuses when `NODE_ENV === "production"`, which is not set when you run it locally with `tsx` | `scripts/reset-db.ts` | Host allow-list guard (localhost or the nonprod project only) |
| C4 | **Compute and database are in different regions.** `vercel.json` pins `sin1` (Singapore); the database host in `.env.local` is `us-east-1`, so each query crosses an ocean | `vercel.json`, `.env.local` hostname | Recreate the database in `aws-ap-southeast-1` (Neon fixes the region at creation); data is seed-only today, so this is cheap now |
| C5 | **Ingestion is in-process.** Upload route runs `after()` over a loop; `documents.ts` does the same; a daily cron retries | `src/app/api/documents/upload/route.ts` (the comment says "move this to a queue"), `src/app/actions/documents.ts`, `vercel.json` crons, `src/app/api/cron/ingest/route.ts` | Vercel Workflow pipeline (3.8) |
| C6 | **Email never leaves.** The sender defaults to `onboarding@resend.dev`, a Resend sandbox address that only delivers to the account owner. Invite and reset flows fall back to showing the link | `src/lib/email.ts`, `docs/DOCUMENTATION.md` ("links are copied manually") | Verify a domain, set `RESEND_API_KEY` and `EMAIL_FROM`, call `sendEmail` from the invite and reset actions (3.10) |
| C7 | **Lexical search is English-only.** `tsv` is generated with the `english` configuration and queries use `to_tsquery('english', ...)`; Hindi text gets no useful lexical index | `src/db/schema.ts` (`document_chunks.tsv`), `ai/lawai_ai/rag/search.py` lines 96-131 | Per-language text-search config or a normalised token column (3.4) |
| C8 | **Scanned PDFs are rejected.** `parse.py` raises "No text layer found" | `ai/lawai_ai/rag/parse.py` | OCR step (3.5) |
| C9 | **Python DB access is autocommit.** `autocommit: True` means there is no transaction in which to set a per-request tenant for RLS | `ai/lawai_ai/db.py` | Wrap each request in a transaction that calls `set_config(..., true)` (3.6) |
| C10 | **Audit trail is mutable and thin.** `activities` and `ai_usage` can be updated or deleted by the app role; `ai_usage` has tokens only, no provider, latency, cost, prompt version or retrieved-chunk record (ARCHITECTURE.md says latency is stored; `schema.ts` has no such column) | `src/db/schema.ts` | Append-only hash-chained `access_log` plus an `llm_calls` ledger (3.12, 3.13) |
| C11 | **Provider choice is binary.** `PROVIDER` is "groq" or the other adapter; no fallback, no per-tier routing, no circuit breaker | `ai/lawai_ai/config.py`, `llm.py` | Router + gateway (3.3) |
| C12 | **Two deadline engines.** The calculator exists in TypeScript and Python and can drift | `src/lib/deadlines.ts`, `ai/lawai_ai/agent/deadlines.py` | One engine, one shared JSON test-vector file that both languages run (Feature 2) |
| C13 | **No login throttling, no MFA, no idle timeout, no CSP.** Sessions are a fixed 14 days; `x-forwarded-for` is stored but never used for limits | `src/lib/auth.ts`, `src/app/actions/auth.ts`, `next.config.ts` | 3.9 and 3.13 |
| C14 | **Seed library is the only legal data.** Research runs on `legal_sources` seed rows | `README.md` known limits | Jurisdiction packs (Feature 2) |

### 2.3 Add

| Addition | Why | Where in this doc |
|---|---|---|
| Neon nonprod project, branch per PR, staging environment | No dev/staging today | 3.6, 3.14 |
| Committed SQL migrations and a migration CI job | C2 | 3.6 |
| Row-Level Security and DB roles | RULE-3 backstop, AC-31 | 3.6 |
| Vercel Workflow + Queues + Cron | C5, NFR-5, NFR-13, FR-16 | 3.8 |
| AI Gateway and model router | C11 | 3.3 |
| OCR and multilingual embeddings | Feature 7 | 3.4, 3.5 |
| Better Auth, MFA, portal principal | Feature 9, enterprise asks | 3.9 |
| Razorpay | No billing today | 3.11 |
| Sentry, `llm_calls` ledger, evals | No observability today | 3.12, 3.15 |
| `render` container service (PDF, TOA) | Features 1, 4, 5, 10 | 3.16 |
| Jurisdiction pack loader | Feature 2 | 4 |

---

## 3. Layer by layer

### 3.1 Frontend

**Decision: keep Next.js 16 / React 19 / Tailwind 4. Add only what the planned features force.**

- The UI is live-data server components with server actions; nothing in the ten features needs a different framework.
- **Hindi display and input:** load Noto Sans Devanagari with `next/font`, set `lang` per document (`hi`, `en`) so browsers shape text correctly, and make the document viewer render the original-language text for citations (FR-34).
- **OCR correction (FR-35):** a pdf.js page view with a text pane side by side, page-level confidence badges (FR-31), "save and re-index".
- **Verified / Unverified chips (FR-2):** extend the existing `[S1]` chip component; plain wording on hover that the label means existence and quote match only (SPEC risk).
- **Client portal (Feature 9):** a separate route group `(portal)` with its own layout, served from a separate hostname (for example `portal.<domain>`). A different host means a different cookie jar, so a firm session cookie can never be presented to the portal and the reverse. No AI chat in the portal (SPEC non-goal).
- **i18n:** UI translation (`next-intl`) is a Phase 3 item for the portal; the SPEC only requires Hindi documents, not a Hindi UI.
- **Do not adopt now:** a component-library rewrite (shadcn/ui and similar); the custom kit in `src/components/ui.tsx` works. Revisit only if portal design needs it.

### 3.2 Backend and API

**Decision: modular monolith in Next.js; one tenant-aware data-access layer; keep Python for AI only.**

- Keep Server Actions for CRUD, route handlers for streaming and webhooks. Validate every input with zod (already the pattern).
- Add `src/db/tenant.ts` exposing `withTenant(user, fn)` that opens a transaction and sets `app.firm_id`, `app.user_id` and `app.role` for RLS (3.6). All read models in `src/lib/queries/*` go through it, so a forgotten `caseScope` filter fails closed.
- **Signed user context to the AI service.** Today Next.js sends a user id plus the shared `INTERNAL_API_TOKEN` (`src/lib/ai-service.ts`). Replace the bare id with a short-lived HMAC-signed context (`user_id`, `firm_id`, `role`, `exp`, `request_id`). A leaked static token then cannot be used to impersonate an arbitrary user.
- **Webhooks** (Razorpay, Resend delivery events, workflow hooks) always: verify signature, record the provider event id, return 200 fast, hand off to a queue. This is the "ingress + idempotency" pattern from the reference document (section 7).
- **Platform API** (`/api/platform/*`) stays bearer-token protected; add per-token rate limit and an `idempotency-key` header on `POST /firms`.
- Pin Node 22 (`engines`), Python 3.12 (`ai/.python-version`).

### 3.3 AI service and LLM gateway (model routing and fallbacks)

**Decision: all model calls stay inside the Python service's `llm.py`; behind it, call one OpenAI-compatible endpoint, the Vercel AI Gateway, which routes to providers. Route by tier, not by feature.**

Why a gateway: the page states zero markup on provider token prices (including BYOK), request logs with every routing attempt, budgets per team/project/key, ordered provider and model fallbacks, and zero data retention by default with per-request enforcement (`zeroDataRetention: true`). That is the failover, cost-control and data-handling machinery we would otherwise build. We keep a **break-glass direct path** (`LLM_ROUTE=direct`) so an outage at the gateway does not take the product down.

| Tier | Used for | Default model class | Fallback |
|---|---|---|---|
| `fast` | titles, document-kind classification, date and entity extraction candidates, query rewriting, chunk context notes | Groq `openai/gpt-oss-20b` ($0.075 in / $0.30 out per M tokens) | Same class at another provider via gateway |
| `chat` | the agent loop, research answers, hearing brief, portal draft updates | Groq `openai/gpt-oss-120b` ($0.15 / $0.60 per M, 131k context) | Second provider for the same open-weight model, then a frontier model |
| `reason` | playbook review, drafting, Table-of-Authorities-adjacent prose | A frontier model chosen by the eval gate (3.15), not by brand | Another frontier model |
| `india` (later) | firms that require in-country inference | An OpenAI model on Amazon Bedrock India profile (in-country per AWS), or a self-hosted open model in Mumbai | None outside India by design |

Rules that go with the table:

1. **Deterministic things are never done by a model.** Verified/Unverified labels, date arithmetic, quote matching and access filters stay in code (RULE-1; reference document "most common mistake").
2. **Structured output + verification.** Extraction tools return JSON; every extracted quote or date must pass a substring check against the document or it is dropped (AC-8 pattern; same idea as `review.py`).
3. **Timeouts, retries, circuit breaker** on every outbound call (httpx timeouts, bounded retries with backoff, a breaker that opens after N consecutive failures and sends traffic to the fallback).
4. **Budget guard** before each call: read the firm's running spend from `llm_calls` (3.12) and refuse beyond a per-firm daily cap (NFR-14). Also an AI Gateway budget as an outer ceiling.
5. **Prompt registry**: prompts live in `ai/prompts/*.md`, each with a version; the version and a hash are written to `llm_calls` so any answer can be traced to its prompt.
6. **Prompt-injection posture**: document text is untrusted input; tools are read-only except those that create *drafts* (RULE-2, FR-13); no tool can write to calendar, tasks, time entries or the portal.
7. **Zero data retention is a contract, not a flag.** Groq documents that ZDR can be enabled in Data Controls and that its customer data buckets are in the United States, with no India region found. So: enable ZDR, sign the DPA, and disclose Groq as a sub-processor in the ethical-wall receipt (FR-23). For firms that need in-country inference, use the `india` tier.

Cost note: Groq prices for 120B/20B above come from Groq's model page on 2026-10-19. A frontier model for `reason` costs materially more per token; limit it to review and drafting, where quality is the product.

**Alternatives rejected:** LiteLLM or a self-run proxy (a database, a service and upgrades to maintain); LangChain or LangGraph for the agent loop (see section 7: the agent here is an 8-step tool loop, not a graph).

### 3.4 RAG and embeddings (multilingual)

**Decision: keep the retrieval architecture; change the embedding model and the lexical config; make the model swappable.**

What stays: structure-aware clause chunking, HNSW vectors, FTS, RRF (k=60), clause-number boost, rerank, permission filter inside SQL.

What changes:

1. **Multilingual embedding model.** `voyage-law-2` is documented as legal-optimised with a 16k context; Voyage's docs page I read describes only `voyage-4-large` and `voyage-4` as multilingual and lists no Hindi support statement for any model. A cross-language query (English question, Hindi passage; FR-32) needs one shared embedding space, so mixing models is not possible. Run a **bake-off in Phase 1** (one or two days, 30 bilingual query/passage pairs as in AC-20) across: `voyage-4`, `voyage-law-2` (control), OpenAI `text-embedding-3-large` at 1024 dims, and the open-weight BGE-M3 (1024-dim, self-hostable in Mumbai). Pick on recall@5 and price; default expectation is `voyage-4` at 1024 dims (list price about $0.06 per M tokens per a third-party tracker, to be confirmed on Voyage's pricing page). Do this bake-off **early**: switching embedding models later means re-embedding the whole corpus.
2. **Keep 1024 dimensions** so `document_chunks.embedding vector(1024)` and the HNSW index do not change. Add `embedding_model text` to `document_chunks` and `legal_sources`; re-embed in a background workflow and swap by model name.
3. **Lexical search.** Replace the hard-coded `'english'` configuration with a per-row `language` (`en`, `hi`, `mixed`). For Devanagari use the `simple` configuration on normalised text and test it on real Hindi: Postgres's default parser can split words at combining vowel signs, so **this is a test-gated assumption**, with `pg_trgm` and vector-only as the fallback. Neon also offers BM25 through the `lakebase_text` extension (documented in `.agents/skills/neon-postgres/references/hybrid-search.md`); evaluate it for English ranking in the same bake-off.
4. **Context notes without the cost explosion.** The README warns that contextual retrieval "sends the whole document once per chunk". At 5,000 documents of about 20k tokens and about 30 chunks each that is billions of input tokens without provider-side caching. Change the default to: heading path (already stored) + a one-paragraph document summary + neighbouring-section titles as the context; use a per-chunk LLM note only for chunks with no heading, and run it on the batch/`fast` tier.
5. **OCR-aware chunks.** Chunks carry `page_number` plus (after OCR) `ocr_confidence` and a bounding-box reference, so citations and correction jump to the right place (FR-31, FR-35).
6. **Retrieval is logged** (chunk ids and scores, no text) into the access log (3.13) so the ethical-wall receipt is built from stored facts (FR-25).
7. **Machine translation is a display feature only.** Translated text is never stored in `document_chunks.content` and is never an input to citation verification (FR-34, RULE-8).

Evaluation gates (3.15): recall@5 on the bilingual set at least 80 percent (AC-20, threshold to be confirmed after the trial), and an English regression set so the change does not hurt today's retrieval.

### 3.5 OCR (Hindi and English)

**Decision: run a bake-off, but start with Sarvam Vision as primary and Google Document AI as fallback; keep Tesseract for local development only.**

| Option | Evidence | Price | Notes |
|---|---|---|---|
| Sarvam Vision | Vendor docs: 23 languages (22 Indian plus English), 10 pages per job, 200 MB file limit; Trust Center claims India-only data residency, ISO 27001, SOC 2 Type II; a newer Vision 2.1 was reported September 2026 (forms, tables, handwriting) | Official pricing page: Rs 0.5 per page (an older page still shows Rs 1.50, treat 0.5 as current but confirm) | Specialist for Indic scripts; vendor benchmarks only |
| Google Document AI, Enterprise Document OCR | Official pricing page | $1.50 per 1,000 pages (to 5M pages a month) | Broad language support; confirm Hindi quality and a Mumbai (`asia-south1`) processor location before relying on it |
| Mistral OCR 4 | Third-party reports, June 2026 | about $4 per 1,000 pages ($2 batch) | Hindi not confirmed in what I found |
| Tesseract `hin+eng` (self-hosted) | Open source | free | Local dev and fallback; expect weaker accuracy on real scans |

Caveats stated plainly: the vendor benchmark that scored classic cloud OCR near zero on Indic text is published by Sarvam (a vendor), and an independent benchmark noted that most systems collapsed on real Devanagari scans. **Do not choose from marketing numbers.** The bake-off is: 30 real or realistic scanned pages (court orders, notices, stamped affidavits, mixed Hindi/English), measure character error rate on a hand-checked subset and the share of pages flagged low-confidence, compare cost per 100-page file.

Pipeline design (inside the Workflow in 3.8):

- Split the PDF into batches of at most 10 pages (Sarvam's cap), OCR batches in parallel with per-batch retry, stitch text with preserved page offsets (FR-31).
- Per-page confidence is stored; pages under a threshold are flagged for human correction (FR-35); corrections trigger re-indexing.
- Per-firm OCR page budget (NFR-14): a firm-level counter checked before each batch.
- Cost for context: 9,000 scanned pages a month is about Rs 4,500 (about $50) at Rs 0.5 per page.
- Residency: Sarvam is the India-resident option; Google needs a region check; either way OCR is another sub-processor to list in the receipt.

### 3.6 Database (environments, branches, migrations, backups, RLS)

**Decision: stay on Neon Postgres. Two Neon projects. Singapore now. Row-Level Security added. Committed migrations. India-resident database is an explicit owner decision with a trigger (D1 in section 6).**

**Environments**

| Environment | Database | Data | Who connects |
|---|---|---|---|
| Local | Docker Postgres (`docker-compose.yml`, already present) | Synthetic seed (`npm run db:seed`) | Developers |
| Preview (per PR) | Neon branch of `nonprod/main`, created by a GitHub Action, deleted on PR close | Synthetic seed | PR deployment only |
| Staging | `nonprod` project, long-lived `staging` branch | Synthetic, never production copies | Staging deployment, QA |
| Production | `prod` project, separate API keys, separate roles | Real | Production deployment only |

Why two projects rather than branches of one: a stolen non-production key or a mis-set environment variable cannot touch production, and production can sit on a higher plan (IP allow-list, longer restore window) without paying that for every branch. Copying production data into staging would put client data in a weaker environment (DPDP), so staging is synthetic.

**Neon facts used** (plans page, 2026-10-19): Launch and Scale are pay-as-you-go at $0.106 and $0.222 per compute-unit-hour, storage $0.35 per GB-month, 10 branches included on Launch (25 on Scale), extra branches $1.50 per branch-month, restore window up to 7 days on Launch and 30 days on Scale at $0.20 per GB-month of change history. IP allow-list, private networking, HIPAA and SOC 2 are Scale features. Plan: **Launch for the pilot; move production to Scale when the first firm asks for a SOC 2 report or IP allow-listing** (about 2x the compute rate).

**Region.** Neon's region list (2026-10-19) has Singapore (`aws-ap-southeast-1`), Sydney, Frankfurt, London, three US and São Paulo. **It has no Mumbai or Hyderabad region.** The production host in `.env.local` is `us-east-1` (C4). Move production to Singapore now (co-located with `sin1` compute), while the data is seed-only.

India residency options, so the owner can choose (D1):

| Option | Region | Branching | Cost shape | Verdict |
|---|---|---|---|---|
| Neon, Singapore (recommended default) | Singapore | Instant copy-on-write | About $55-110 prod | Fast to ship; data is outside India |
| Supabase Postgres | Mumbai `ap-south-1` (listed in its region docs) | Branches are separate instances, about $0.0134 per branch-hour per its pricing page | Pro plan $25 base plus compute (third-party figure) | Best fit if "data stored in India" must be true from day one |
| Aurora PostgreSQL via Vercel Marketplace | Mumbai | Cloning, not instant branches | Highest ops | Enterprise tier, Phase 3 |

DPDP context (3.13): the notified DPDP Rules (14 November 2025) phase in most obligations about 18 months later; cross-border transfer is permitted subject to restrictions the government may notify, and Significant Data Fiduciaries have stricter duties. So storing data in Singapore is **not unlawful today**, but it is a sales objection for Indian law firms, and true residency also needs the LLM, embedding and OCR calls to stay in India (3.3, 3.5). Therefore: portable stack now (postgres-js, psycopg, Drizzle, no Neon-only SDK), and a written migration runbook (logical dump and restore, tested once) so the move is a day, not a project.

**Connections.** Pooled (`-pooler`, PgBouncer transaction mode) for the app and AI service; direct connection for migrations (the Neon guidance in `.agents/skills/neon-postgres/SKILL.md` warns that migrations over the pooled string fail in confusing ways). Add `DATABASE_URL_UNPOOLED`.

**Migrations.** `drizzle-kit generate` produces SQL committed in `drizzle/`; `drizzle-kit migrate` applies it. CI applies migrations to the PR's branch database, then production migrates in the deploy pipeline before the new code is promoted. Rules: expand-then-contract (add nullable column, backfill, switch code, drop later), never `push` against shared databases, one baseline migration generated from the current schema and checked against production with `drizzle-kit` diff.

**Backups.** Neon history/PITR plus a nightly logical `pg_dump` to an S3 bucket in `ap-south-1` with Object Lock (WORM) in a **separate cloud account**; quarterly restore drill to a new branch with a measured recovery time. Retention periods are an open decision (D5).

**Row-Level Security (RULE-3, FR-52, AC-31).** The access filters in `src/lib/access.ts` and `ai/lawai_ai/access.py` are correct but hand-applied in every query; RLS makes a missed filter return zero rows instead of leaking.

- Roles: `lawai_owner` (runs migrations, owns tables), `lawai_app` (used by Next.js and the AI service; `NOBYPASSRLS`, no ownership), `lawai_portal` (SELECT only on portal views, Feature 9), `lawai_audit_writer` (INSERT only on the access log, Feature 5), `lawai_readonly` (support, reporting).
- Per transaction: `select set_config('app.firm_id', $1, true), set_config('app.user_id', $2, true), set_config('app.role', $3, true)`. The `true` flag makes it transaction-local, which is the only form safe with PgBouncer transaction pooling. This needs the transaction wrapper from 3.2 and replacing `autocommit: True` in `ai/lawai_ai/db.py` (C9).
- Policies: every table `USING (firm_id = current_setting('app.firm_id')::uuid)`. Matter-scoped tables (`cases`, `events`, `tasks`, `documents`, `document_chunks`, `document_issues`, `time_entries`) add `AND (app.role = 'admin' OR case_id IN (SELECT case_id FROM case_members WHERE user_id = current_setting('app.user_id')::uuid))`. Time drafts (Feature 8) add `user_id = app.user_id`.
- Performance risk: the chunk table is the hot path (HNSW with a filter). Keep the existing `firm_id, case_id` columns on chunks (they are denormalised exactly so the filter does not need a join) and benchmark top-k latency with RLS on; this is assumption A9.
- Test: a CI test that signs in as users of two firms and calls every list endpoint and AI tool, asserting zero foreign rows (AC-31).

**Search extension choice** stays pgvector (HNSW); no pgvectorscale or time-series extension is needed at this scale (section 7).

### 3.7 File storage

**Decision: Vercel Blob (private) for documents, exports and OCR page images; S3 `ap-south-1` with Object Lock only for backups and audit anchors.**

- Blob pricing (usage page, 2026-10-19): storage $0.023 per GB-month in the worked example, operations $0.40 per million simple and $5.00 per million advanced, plus data transfer. 100 GB is a few dollars a month. Private delivery goes through a function, which is what `src/app/api/documents/[id]/file/route.ts` already does, so matter-level access is enforced on every download (keep it).
- **Browser upload size:** requests and responses through a function are capped at 4.5 MB, while `next.config.ts` allows 30 MB server actions; large uploads should use Blob client uploads (browser to Blob, bypassing the function) with a server-issued, authorised upload token, then a Workflow starts. Required before scanned bundles of 100 pages.
- Key layout: `firm/<firm_id>/<document_id>/<version>/<filename>` (the storage keys are already path-traversal safe in `storage.ts`).
- Virus scan on upload (ClamAV in the `render` container or a managed scanner) before a document leaves "pending" (Phase 2).
- Region: Blob store region should match compute; in the India-resident tier, use S3 `ap-south-1` (the `S3_*` driver already exists in `storage.ts`).
- Delete and retention: soft-delete plus a scheduled hard-delete job honouring the retention decision D5.

### 3.8 Background jobs, queues, scheduling

**Decision: Vercel Workflow for multi-step durable pipelines, Vercel Queues for simple fan-out, Vercel Cron as the clock. Hide all three behind a `jobs/` interface.**

What each does here:

| Need | Tool | Detail |
|---|---|---|
| Ingestion: fetch, OCR batches, parse, chunk, context, embed, upsert, classify, propose | Workflow | Steps are retried and resumed after a crash; each step calls the Python service over the service binding; idempotency key is `document_id + version + step` |
| Scheduled hearing briefs (FR-16) | Cron + Workflow | Hourly cron finds hearings in the next window with no brief, starts one workflow per hearing; time zone `Asia/Kolkata` |
| Hearing reminders (Feature 11) | Cron (hourly, Pro) + Queue | Cron finds reminders due in the next hour per matter time zone and enqueues one message per recipient and channel; idempotency key is reminder + hearing version + recipient + channel; provider webhooks update `reminder_deliveries`; a failed channel falls back to the next one |
| Court-date watch (Feature 12) | Cron + Workflow | Daily per court source with per-court rate limits and back-off; writes `court_readings` and Feature 3-style proposals; a source can be switched off without a deploy |
| Jurisdiction pack refresh | Cron + Workflow | Weekly per source; writes a new pack version; never edits a released version (NFR-3) |
| Daily time-capture drafts (Feature 8) | Cron + Queue | One message per user-day; handler is idempotent |
| Email sends, webhook processing | Queue | At-least-once; handlers idempotent on message id |
| Portal update approval (Feature 9) | Workflow with a hook | Waits for the firm admin's approval event; no timer needed |

Facts (Vercel docs, 2026-10-19): Workflow bills events at $0.02 per 1K events, data written at $0.50 per GB, retained at $0.50 per GB-month, with no maximum run duration, up to 10,000 steps and 25,000 events per run, and managed persistence retained **7 days on Pro** after a run completes. Queues bills per operation in 4 KiB chunks, messages are retained 24 hours by default (up to 7 days). The installed Vercel skill describes Queues as public beta; confirm GA status before depending on it for anything that cannot be replayed.

Design rules (these are the reference document's reliability layer, scaled down):

1. **The database is the system of record, not the workflow store.** `documents.ingest_status` (+ reason) is updated by each step; the 7-day workflow retention is irrelevant to correctness.
2. **Idempotent steps and an idempotency key at every ingress** (upload, webhook, cron tick).
3. **Timeouts on every step**; a stuck step ends in `failed` with a reason (NFR-13), visible in the UI with a "retry" button, replacing the blind daily cron retry.
4. **Per-firm concurrency and budget caps** so one firm's 2,000-file import cannot starve others or run up a bill (NFR-14).
5. **Dead-letter equivalent:** after N attempts the document is `failed`, an in-app notification and an operator metric fire.
6. The existing `/api/cron/ingest` stays as a safety net that re-enqueues anything still `pending` after an hour.

Alternatives: Inngest or Trigger.dev (good products, second vendor and a second place client data flows), Redis + ARQ as in the reference document (an always-on Redis to run), Temporal (heavy). Plan B if Workflow disappoints in the Phase 1 spike: Inngest behind the same interface (assumption A3).

### 3.9 Auth (MFA, SSO, client-portal users)

**Decision: move from the hand-rolled auth to Better Auth on our Postgres; enforce TOTP MFA; add SAML/OIDC SSO when a customer asks; build the client portal as a separate principal.**

Today: `src/lib/auth.ts` (bcrypt passwords, sessions table, hashed token cookie), `src/app/actions/auth.ts`, invite and reset links in `user_tokens`, role enum of three values, `proxy.ts` that only checks cookie presence. It is a sound base and has no MFA, SSO, lockout or second principal type.

- **MFA:** Better Auth's two-factor plugin supports TOTP (QR enrolment), single-use backup codes and email/SMS OTP via a sender function we supply (per its documentation page). Policy: mandatory for firm admins and the platform operator, required for attorneys after the first month, optional for paralegals; recovery by backup codes or an admin-initiated reset that is itself logged.
- **Migrating passwords:** keep verifying existing bcrypt hashes through a custom verify function and re-hash on next login. No forced reset.
- **SSO:** SAML/OIDC is a separate Better Auth package (reported by third-party sources; verify during the spike). Commercial alternative if more than about three firms want SAML or SCIM: WorkOS, with AuthKit free to 1M MAU and SSO at **$125 per connection per month** (figures from third-party comparison pages; confirm with WorkOS). Pass the connection cost through in the Enterprise plan.
- **Client-portal principal (Feature 9, FR-41, RULE-4):**
  - Separate table `portal_users` bound to one or more `clients`; no row in `users`; no role in `user_role`.
  - Separate Better Auth instance with passwordless sign-in (email one-time code or magic link) so clients have no passwords to leak or reuse, a separate cookie name and host (3.1), and no code path from a portal session to `requireUser()`.
  - Reads only through database views of approved, client-visible rows, queried as `lawai_portal` (3.6). A portal session therefore **cannot** read internal data even if application code is wrong (AC-25).
  - Invitations are firm-issued and revocable; every request checks the invitation and session are still valid (AC-27); portal sessions are logged (FR-45).
- **Hardening that ships with it (Phase 0):** failed-login throttling per account and per IP, session idle timeout (for example 12 hours idle, 14 days absolute), revoke all sessions on password change or reset, device list in settings.
- **Alternatives considered:** Clerk through the Vercel Marketplace (fast, but users and sessions live in a US vendor, per-MAU pricing, and the portal and RLS integration is harder), Auth0, Neon Auth (managed Better Auth; fine, but ties auth to the database vendor we may move).
- **Demo logins:** `SHOW_DEMO_LOGIN` must be unset in production, and demo accounts must not exist in the production database.

### 3.10 Email and notifications

**Decision: Resend now (code exists), SES Mumbai as second provider later; fix configuration first.**

- Resend pricing as reported by third-party aggregators (2026-10-19): free 3,000 emails a month with a 100 per day cap, Pro $20 a month for 50,000. Dedicated IPs are an add-on, not needed for transactional volume at this stage.
- Phase 0 work: verify a sending domain (SPF, DKIM, DMARC with a reporting address), set `EMAIL_FROM` to that domain, set `RESEND_API_KEY` for production and preview, call `sendEmail` from the invite, reset and "resend invite" actions, keep the on-screen link as a fallback when sending fails.
- Webhooks for delivered, bounced, complained events (store in `email_events`, suppress bounced addresses). Send through a Queue so a provider hiccup never fails a user action.
- Templates stay server-rendered HTML in `src/lib/email.ts` (already plain and single-column).
- Notifications beyond email: in-app (existing `notifications` table). Hearing reminders (Feature 11) were requested by the owner on 2026-10-19, so they are no longer a Phase 3 maybe: ship in-app and email first, and start the WhatsApp template and SMS DLT paperwork at the beginning of the build because approval lead time is unknown. Costs and the provider choice are in section 3.17 (proposed).
- Never email client content; links only. Client-portal mail contains a sign-in link, nothing about the matter (3.9).

### 3.11 Payments and billing (India: Razorpay vs Stripe)

**Decision: Razorpay. Start with invoices and payment links for the first firms; add Subscriptions when there are about ten paying firms.**

Evidence (vendor pages, 2026-10-19):

| | Razorpay India | Stripe India |
|---|---|---|
| Availability | Open sign-up | Pricing page button read "Request an invite" |
| Domestic cards and netbanking | 2% platform fee (+ 18% GST on the fee) | 2% |
| International cards | up to 3% | 3% (plus 2% if currency conversion is needed) |
| Subscriptions | cards "0.9% plus platform fees"; UPI / NACH / e-mandate "on request" | Billing 0.7% of billing volume |
| INR recurring (UPI AutoPay, e-mandate) | Supported | Not stated on the page |

Razorpay wins on availability and Indian recurring payment methods. Stripe is cheaper on paper for cards but was not self-serve in India on the day checked. For international customers later: Razorpay international (third-party sources report up to about 3% for cards and about 1% for bank transfer), or a merchant of record (Paddle, Dodo Payments) that handles foreign VAT and sales tax, if LawAI sells outside India.

Design:

- Plans already exist in `src/lib/subscriptions.ts` (`trial`, `starter`, `professional`, `enterprise`, seats, monthly fee, end date). Keep them as the source of truth; Razorpay is the payment rail.
- Webhook (signature-verified, idempotent on event id) -> Queue -> updates `firms.subscription_*` and writes `billing_events`. The operator console keeps its manual override.
- GST-compliant invoices (Razorpay Invoices or an accounting tool), seat changes prorated, failed-payment grace period, then suspend using the existing suspend flow (`/api/platform/firms/[id]/suspend`).
- Not in scope: firms billing their clients (SPEC non-goal).
- Per-seat cost control uses `ai_usage` / `llm_calls`; Reports already show usage.

### 3.12 Observability (logs, traces, errors, LLM evals)

**Decision: Sentry for errors and traces, Vercel Observability for platform metrics, a Postgres `llm_calls` ledger for AI cost and audit, evals in CI. Send metadata, never client text, to any vendor.**

- **Errors and traces:** Sentry on the Next.js app and the Python service (Team plan $29 a month with 50k errors and 5M spans on the pricing page). Scrub request bodies and all text fields in `beforeSend`; attach `request_id`, `firm_id` (hash), release.
- **Structured logs:** JSON logs with `request_id` propagated from Next.js to the Python service in the signed context; Vercel runtime logs are enough for the pilot; no log drain yet.
- **AI ledger (`llm_calls`):** one row per model call: `request_id`, `firm_id`, `user_id`, `feature`, `tier`, `provider`, `model`, `prompt_id`, `prompt_hash`, `input_tokens`, `output_tokens`, `cost_micro_usd`, `latency_ms`, `status`, `fallback_used`, `scope_hash`. It supersedes today's `ai_usage` (tokens only). It powers the Reports page, the per-firm budget guard (3.3) and the cost-per-answer metric. It is plain Postgres, partitioned monthly; no time-series database is required at this scale.
- **Why not a hosted LLM-trace vendor now:** Langfuse Cloud (Core $29 a month, US, EU or Japan regions) would receive prompts and completions, which contain client confidences and would add a sub-processor outside India. Revisit self-hosted Langfuse in Phase 3. Until then, replay uses our own ledger plus synthetic eval data.
- **Alerts:** error rate, p95 latency of chat and ingestion, queue age, budget exhaustion, fallback rate, failed-ingest count, backup freshness. Delivery: Sentry and Vercel alerts to email and a Slack channel.
- **Status page and uptime:** a free hosted status page plus an uptime check on `/api/health` and the AI service `/health` before the first paid firm.
- **Product metrics for reliability, not surveillance:** per-feature accept/dismiss rates (they also feed Feature 6), thumbs up/down (`messages.feedback`), answer-without-source rate.

### 3.13 Security and compliance

**DPDP Act and the Rules.** The Rules were notified on 14 November 2025; sources agree that most operative rules (including Rule 15 on cross-border transfer and Rule 13 on Significant Data Fiduciaries) commence about 18 months later (about May 2027), with consent-manager provisions earlier. Treat as a runway, not an exemption. Working assumptions, to be confirmed with counsel: the **firm is the data fiduciary** for client personal data and **LawAI is a processor** (so a Data Processing Agreement is needed); breach notification and deletion duties apply; a grievance contact is required; and the government may restrict transfers to notified countries.

**What to build**

| Control | Choice | Maps to |
|---|---|---|
| Tenant isolation | App filters + RLS + cross-firm CI test | RULE-3, FR-52, AC-31 |
| Audit log | Append-only, hash-chained `access_log`: `seq`, `firm_id`, `user_id`, `case_id`, `feature`, `action`, `object_ids`, `chunk_ids`, `denied`, `prev_hash`, `hash`. `lawai_audit_writer` has INSERT only; a `SECURITY DEFINER` function appends under a per-firm advisory lock so the chain stays ordered; triggers reject UPDATE and DELETE; a nightly job verifies the chain and writes the head hash to the Object-Lock bucket | FR-21..25, NFR-9, NFR-10, AC-13..15 |
| Admin actions | Existing `activities` table stays for user-visible history; security events (login, MFA, role change, export) also go to the chain | FR-24, FR-50 |
| Encryption | In transit TLS; at rest provider-managed (database, Blob); no application-level field encryption in Phase 0 to 2. Customer-managed keys (S3 SSE-KMS in `ap-south-1`) are a Phase 3 enterprise feature | Enterprise ask |
| Secrets | Vercel environment variables marked sensitive, scoped per environment; rotation calendar; gitleaks in CI and a pre-commit hook; no secret in the repo (RULE-5, NFR-21, AC-31) | RULE-5 |
| Rate limiting / WAF | Vercel WAF rate-limit rules (available on all plans, fixed window, 40 rules on Pro, counting by IP or JA4) on `/login`, `/invite/*`, `/api/chat`, `/api/documents/upload`, `/api/platform/*`; plus app-level per-account lockout and per-firm AI budget because IP limits alone are weak behind shared office NATs | Abuse, cost control |
| Headers | Add CSP with nonces, HSTS, `frame-ancestors 'none'`; keep existing headers in `next.config.ts` | Hardening |
| Service-to-service | Signed, expiring user context (3.2) in place of a bare user id | Spoofing |
| LLM data handling | ZDR on (3.3), prompt training disallowed, DPA and sub-processor list; the receipt lists the providers that processed content (FR-23) | DPDP, FR-23 |
| Uploads | Type and size checks (exist), antivirus, content-type sniff, never serve user HTML inline | Hardening |
| Deployment Protection | Keep **Standard Protection** (previews are protected; production domains are public) with Vercel Authentication; use Protection Bypass for Automation only in CI for Playwright; move production to a custom domain. This is a feature, not a gap: previews now connect to a nonprod database, but they still must not be public | Preview safety |
| Retention and deletion | Configurable per firm; firm-offboarding export and verified deletion within a stated time; logs keep identifiers and hashes, not text (NFR-10) | D5 |
| Incident response | Written runbook, on-call phone tree, breach-notification template; a tabletop test before the first enterprise customer | DPDP |
| Assurance | SOC 2 Type 1 readiness checklist in Phase 3 (Neon Scale and Vercel Enterprise reports help); external penetration test before the first enterprise contract | Enterprise ask |

**GDPR later.** The same stack deploys as a regional "cell" (own Vercel project, Neon project, Blob/S3 and OCR/LLM routes in the EU), with the firm assigned to a cell at onboarding. Do not build the cell mechanism now; do keep region and provider names configuration-driven and keep `firm_id`-scoped everything so a firm can be exported and moved. Add data-subject export and erasure tooling and SCC-based DPAs when the first EU firm is in sight.

### 3.14 CI/CD and environments

**Pipeline (GitHub Actions + Vercel + Neon)**

1. On pull request: install; `tsc --noEmit` (the current `lint`); ESLint or Biome (add, none today); `vitest`; `pytest` (`npm run ai:test`); gitleaks; `drizzle-kit check`; dependency audit (`npm audit`, `pip-audit`); Dependabot for both.
2. Create the Neon branch `pr-<number>` from `nonprod/main`, apply migrations, seed synthetic data, set the Vercel preview environment's `DATABASE_URL` for that deployment, run **Playwright** against the preview URL using the protection-bypass header, run the **eval gate** when files under `ai/prompts/`, `ai/lawai_ai/rag/` or `ai/lawai_ai/llm.py` changed.
3. Schema-diff comment on the PR (Neon's schema-diff action).
4. On merge to `main`: deploy to the **staging** environment (nonprod `staging` branch), run the smoke e2e; then a manual approval promotes to **production**, applying migrations first with a direct (unpooled) connection.
5. On PR close: delete the Neon branch.
6. Rollback: Vercel instant rollback for code; database changes follow expand-then-contract so the previous release still works with the new schema.

**Environment variables:** use Vercel's Production, Preview and Development scopes; developers run `vercel env pull --environment=development` so `.env.local` contains development credentials only. Delete the production `DATABASE_URL` from every laptop and rotate the production password (Phase 0). Hold at most one set of production secrets per place.

**Feature flags:** Vercel Flags or an environment-variable switch for staged rollouts (portal, OCR), cheap and enough.

Evidence of work needed: `package.json` has no `test`, `format` or `migrate` scripts; there is no CI configuration in the repository (no `.github/`); the root `Dockerfile` and `docker-compose.yml` exist for the self-host path and should stay working as the "run it anywhere" option but are not the production route.

### 3.15 Testing (unit, e2e, LLM evals)

| Level | Tool | What it covers |
|---|---|---|
| Unit (TS) | Vitest | `src/lib/deadlines.ts`, `access.ts` predicates, permission matrix, zod schemas |
| Unit (Python) | pytest (exists) | chunking, fusion, deadlines, citation parser, quote verification, provider translation |
| Shared vectors | One JSON file of deadline cases run by both languages | Kills C12 drift; extended with court-holiday cases (AC-4) |
| Integration | pytest and Vitest against a Postgres+pgvector container | RLS (two firms, every endpoint and tool: AC-31), hash-chain verification, append-only enforcement (AC-14), portal views (AC-25) |
| E2E | Playwright on preview URLs (protection bypass header) | login + MFA, invite and reset from a captured email, upload -> ingest -> cited answer, proposal confirm, portal approve -> visible -> retract |
| LLM evals | A small pytest-based harness in `ai/evals/` with versioned golden sets | see below |

**Eval suites (gate merges that touch prompts, models or retrieval)**

1. **Citation verification** (deterministic, no model): known-good, invented and one-word-altered quotes (AC-1, AC-2).
2. **Retrieval:** English golden set (recall@5 no regression) and the 30-pair bilingual set (at least 80 percent, AC-20).
3. **Faithfulness:** sampled answers judged against retrieved passages by a judge model from a different family than the answerer; threshold on "unsupported claim rate", with human spot checks monthly.
4. **Extraction (Feature 3):** notices with labelled dates; a date not found verbatim must not be proposed (AC-8).
5. **Safety:** cross-matter probes: an unstaffed user's questions must return nothing from other matters (the Mehta demo as a regression test).
6. **Cost and latency:** tokens and p95 per task, so a model swap that doubles cost fails visibly.

Rules: evals run on **synthetic or public documents only** (no client data); temperature 0 and recorded model/prompt hashes; thresholds ratchet upward; failures print the diff. Tools such as promptfoo or Langfuse datasets are reasonable later but not needed to start.

### 3.16 Document export (PDF and Table of Authorities)

**Decision: a small container service `render` running WeasyPrint for PDF, `python-docx` for DOCX.**

- Why WeasyPrint: it implements CSS paged media, including `@page` rules, running page numbers and `target-counter(attr(href), page)` with `leader()`, so a Table of Authorities entry can be generated by CSS as "authority ... page N" from anchors in the body. That is the one-engine answer to NFR-20 (page numbers in the table match the render) and AC-29.
- Why a container: WeasyPrint needs native text-shaping libraries (Pango/HarfBuzz) that the standard Python runtime does not ship. Vercel supports container-image functions via `Dockerfile.vercel` and containerised services (`runtime: "container"` in `vercel.json` services). Stateless, scale-to-zero after 5 minutes idle in production, so the first export after idle is a cold start; fine for an export button, not for chat.
- Fonts: bundle Noto Sans Devanagari and a Latin legal serif so Hindi quotes render correctly; verify shaping on conjuncts.
- Court profiles (FR-46): CSS files per court (`supreme-court-of-india.css`, `delhi-hc.css`, `bombay-hc.css`) setting page size, margins, numbering, line spacing, delivered in the SPEC order. A profile is data (a stylesheet plus a JSON manifest), not code.
- Table of Authorities: built **only from Verified citations** (FR-48), page numbers by `target-counter`; Unverified citations are shown only in the pre-export acknowledgement.
- Fallback if page numbers are ever wrong: a two-pass build (render once, extract page of each anchor from the PDF text, render again with numbers fixed). Keep as a test oracle for AC-29 even if unused in production.
- Integrity: record the document version SHA-256 on the PDF (metadata and footer) and in the export log (FR-49); certificates (Feature 1), hearing briefs (Feature 4) and ethical-wall receipts (Feature 5) use the same service with their own templates.
- Alternative: headless Chromium with Paged.js in a Node function (large-functions beta, heavier, cold starts). Choose it only if WeasyPrint fails the Hindi shaping test (assumption A8).

---

### 3.17 Proposed additions for Features 11 to 16 (added 2026-10-19)

Status: proposed, not approved. Everything here follows from the six features added to SPEC.md on 2026-10-19 (Hearing reminders at the owner's request; Features 12 to 16 after a gap check). Prices come from third-party pages and are not quotes; the Meta rate card itself is a linked CSV that was not readable, so confirm every number before budgeting.

| Need | Proposed piece | Cost found | Notes and sources |
|---|---|---|---|
| Scheduler for reminders | Vercel Cron on the Pro plan, hourly, plus a Queue per message | Included in the Vercel Pro line of the summary table | Hobby allows one cron run a day with up to 59 minutes of slack, so an evening-before reminder in local time needs Pro, where cron can run once a minute (Vercel docs). Today `vercel.json` has one daily cron at 03:00 UTC |
| WhatsApp (Features 11, 16) | WhatsApp Business Platform through an Indian business solution provider; utility-category templates for reminders and updates | Utility and authentication about Rs 0.115 per delivered message; marketing about Rs 0.8631; provider markup about Rs 0.08 to 0.30 per message or Rs 999 to 9,999 a month flat; GST extra (third-party blogs, April to June 2026, unverified) | Meta bills per delivered template message; user-started service messages get 1,000 free a month per number; service messages become chargeable from 1 October 2026 per one source. Templates need Meta approval; lead time unknown (ASSUMPTION-b89d9a49) |
| SMS (Feature 11) | A DLT-registered Indian SMS provider, with the sender ID and the message template registered | About Rs 0.10 to 0.18 per transactional SMS; one-time sender and template registration about Rs 5,900 each; one guide also lists a DLT scrubbing charge of about Rs 0.25 per SMS (vendor content, unverified) | TRAI rules require registered templates and an approved template id on each message. Use SMS as the fallback channel, not the first |
| Email delivery status | Resend webhooks into `reminder_deliveries` (delivered, bounced, complained); suppress bounced addresses | Free tier 3,000 emails a month with a 100 a day cap; Pro $20 for 50,000 (third-party summaries); see 3.10 | The 100 a day cap could bind on a busy evening; upgrade before the first pilot firm |
| Map link | Plain Google Maps search URL built from the address | No key needed; whether use is free of charge is not stated on the page | `https://www.google.com/maps/search/?api=1&query=...` |
| Court-date source (Feature 12) | Adapters: manual import, public cause-list PDF parser, eCourts reader only with written permission | No fee for the first two; a data partner would be quoted | No official eCourts API found; lookups need a captcha; terms on automated access were not found (ASSUMPTION-8c002900). Do not build captcha solving |
| Order ledger (Feature 13) | Extra ingestion step on the existing `fast`/`chat` tiers | A few thousand tokens per order; small against the 80 to 200 dollars a month token line in the summary | Verbatim quote check as in `review.py` |
| Fee and duty calculator (Feature 14) | Pack tables and a pure function; no vendor | Lawyer review time per state | Start with Delhi and Maharashtra (ASSUMPTION-28217fff) |
| Conflict check (Feature 15) | Postgres `pg_trgm` and one `SECURITY DEFINER` function | None | Confirm the extension on the chosen Postgres host; needs the owner's approval of the matter-filter exception (ASSUMPTION-8a1b6888) |
| Voice notes (rejected for now) | Sarvam speech-to-text | Rs 30 per hour of audio (Rs 45 with speaker labels) | Not added: phone keyboards already dictate Hindi and English. Hindi-English mixed speech is not confirmed on the pricing page. Revisit after Feature 7 |

Pilot volume check: assume 5 firms, 40 hearings a month each, about 3 staff recipients and one client copy per hearing, two channels each. That is roughly 1,600 messages a month; at Rs 0.2 to 0.45 per WhatsApp message the cost is roughly Rs 300 to 700 a month, and similar for SMS fallback only when used. This is under $10 a month and is not included in the $350 to 650 pilot total. Provider fixed fees (Rs 999 to 9,999 a month) would dominate if a flat-fee provider is chosen, so ask for per-message pricing at pilot size.

Sources: https://developers.facebook.com/docs/whatsapp/pricing ; https://myoperator.com/blog/whatsapp-business-api-pricing-india-2026 ; https://docs.webengage.com/docs/trai-sms-dlt-regulations-india ; https://www.messagecentral.com/blog/a2p-sms-pricing-india ; https://vercel.com/docs/cron-jobs/usage-and-pricing ; https://developers.google.com/maps/documentation/urls/get-started ; https://docs.sarvam.ai/api-reference-docs/pricing ; research notes are Genesis records KNOWLEDGE-d41f2d01, KNOWLEDGE-77db087b, KNOWLEDGE-803278e6.

## 4. The sixteen SPEC features mapped to the stack

Build order from SPEC.md: 1, 11, 2, 3, 12, 4, 13, 8, 5, 15, 9, 16, 10, 14, 6, 7. Features 11 to 16 were added on 2026-10-19 and are marked *proposed* until the owner re-approves the specification.

| # | Feature (FR IDs) | Stack pieces it needs | New tables / pieces | Notes |
|---|---|---|---|---|
| 1 | **Cite-Proof ledger** (FR-1..5) | Python citation parser (Indian formats such as AIR, SCC, SCR, neutral citations, plus statute-section patterns); deterministic lookup against `legal_sources` and the matter's chunks; verbatim quote check (extends `review.py`); `render` for the certificate PDF; RLS; Workflow only for re-check on edit | `citation_checks` (document version hash, citation, label, matched source, method, time), `certificates` | The model may propose citations, never labels (FR-3). Wording: Verified means found and quote matches, not good law |
| 11 | **Hearing reminders** (FR-53..62) *proposed* | Hourly Vercel Cron (needs Pro: Hobby allows one run a day) finds reminders due in the next hour in each matter's time zone (`jurisdictions.timezone`, India `Asia/Kolkata`) and enqueues one Queue message per recipient and channel; in-app via `notifications`; email via `sendEmail` in `src/lib/email.ts` (Resend, idempotency key, delivery webhooks); WhatsApp Business Platform through an Indian provider (utility template approved by Meta); SMS through a DLT-registered Indian provider; map link is a plain `google.com/maps/search/?api=1&query=` URL (no key); message text built from database fields, no model | `reminders` (event, version, kind, scheduled time), `reminder_deliveries` (recipient, channel, status, provider id, error, time), `notification_prefs` (user, channel, on/off), `client_contacts` (number, channel consent, opt-out); new columns `events.courtroom`, `address`, `what_to_bring`, `updated_at`, an attendee list, `users.phone`, `notifications.firm_id` and `type` | Proposed. Cheapest feature: events, bell and email exist. Client copy needs firm-admin approval and is re-approved after any change (FR-56, INVARIANT-0e524254). Start WhatsApp template and SMS DLT paperwork at the start of the build; ship in-app and email first if approvals lag. Cost: email fits the Resend free tier at pilot volume; WhatsApp utility about Rs 0.115 per message plus a provider markup of about Rs 0.08 to 0.30, so roughly Rs 200 to 450 per 1,000 messages; SMS about Rs 0.10 to 0.18 per message plus one-time registration (all third-party figures, unverified) |
| 2 | **Jurisdiction Packs** (FR-6..10) | Versioned pack files in the repo (`packs/<country>/...` with provenance fields), loaded by a platform-operator CLI or Workflow into DB tables; Cron + Workflow for refresh; one shared deadline engine; official sources: India Code (statutes), official court holiday lists, MHA IPC-to-BNS tables; pack records carry source URL, licence, retrieval date, reviewer | `packs`, `pack_versions`, `pack_records`, `court_holidays`, `bns_mapping` | Confirm each source's licence before ingesting (FR-10); I did not verify India Code's reuse terms. Open data exists for judgments (Indian High Court and Supreme Court judgments on the AWS Open Data registry, CC-BY-4.0, bucket in `ap-south-1`), usable later; SPEC excludes case-law reporters in release 1 |
| 3 | **Service-to-calendar autopilot** (FR-11..15) | Workflow ingestion; `fast` tier classifier; extraction with structured output and verbatim quote check; deadline engine; draft proposals only; Resend for "proposals waiting" mail; RLS | `proposals` (state: draft, confirmed, rejected; source page and quote) | Nothing is written to `events`/`tasks` until a human confirms (FR-13, AC-7). No scanned input until OCR ships (SPEC non-goal) |
| 12 | **Court-date watch** (FR-63..69) *proposed* | Daily Cron + Workflow per court source; source adapters behind one interface in the Python service: (1) manual import of the official eCourts app export or a pasted date, (2) parser for public cause-list PDFs (reuse `rag/parse.py`), (3) automated eCourts reading only after written permission or through an authorised data partner; reuses Feature 3's `proposals` and Feature 11's reminders; rate limits and back-off per court | `court_links` (matter, CNR or court/type/number/year, source), `court_readings` (source, time, raw text, parsed next date, stage, bench, serial), `court_sources` (platform-managed: court, legal basis, enabled flag) | Proposed. No official eCourts API was found and lookups need a captcha, so access is the main unknown (ASSUMPTION-8c002900); no captcha-solving is proposed. No per-call fee for the manual and PDF routes; a data partner would be quoted. Table stakes among Indian practice tools, so the value is the reviewed-proposal flow, not the feed |
| 4 | **Hearing-day brief** (FR-16..20) | Cron + Workflow per hearing; `chat` tier with source-linked statements (RULE-8); Cite-Proof labels; `render` for the one-page PDF; RLS | `briefs`, `brief_versions` (changed-since markers) | Statements without a source are omitted (AC-12). NFR-7 (60 s for 200 documents) needs retrieval limits and parallel steps |
| 13 | **Order and adjournment ledger** (FR-70..75) *proposed* | Extra Workflow step after classification in ingestion; `fast` or `chat` tier with structured output; every field kept only if its quote is found verbatim (extends the `review.py` check); proposals for directions reuse Feature 3; printable chronology through `render` | `order_entries` (matter, document, page, order date, business, next date, direction, adjourned, count, summary, quote), `order_entry_corrections` | Proposed. Text-layer English orders first; scanned and Hindi orders wait for Feature 7 (OCR). Extraction accuracy on real orders is unmeasured (ASSUMPTION-fbb3a1a5). Token cost is small (an order is a few pages) |
| 8 | **AI time capture** (FR-36..40) | Daily Cron -> Queue per user; reads `activities`, `events`, `ai_usage`/`llm_calls`; `fast` tier for narrative; RLS policy `user_id = app.user_id` | `time_drafts`, `time_draft_evidence` | Own-user only (FR-39, AC-24); nothing reaches `time_entries` without approval (NFR-16) |
| 5 | **Ethical-wall receipts** (FR-21..25) | Hash-chained `access_log`, `lawai_audit_writer` role, `llm_calls.provider`, `render` for the receipt PDF, nightly chain verification | `access_log`, `access_log_anchor` | Insert via one SQL function under 50 ms (NFR-10); receipt contains ids and titles only (AC-15); denied attempts are logged (AC-13). Do the log earlier than this slot: it is cheap and every later feature should write to it |
| 15 | **Conflict check at intake** (FR-82..87) *proposed* | Postgres `pg_trgm` (standard extension; confirm it is available on the chosen host) with GIN indexes over normalised names; a name normaliser (case, punctuation, initials, Pvt/Private, Ltd/Limited); a `SECURITY DEFINER` SQL function that returns only matched name, role, matter title, status and lead, so the check sees unstaffed matters without exposing their content; each run written to the Feature 5 `access_log` | `parties` (normalised names and roles per matter), `conflict_checks`, `conflict_hits` (resolution, reason, admin, time) | Proposed. Needs the owner's approval of a narrow exception to the within-firm matter filter (ASSUMPTION-8a1b6888, INVARIANT-994c5bc5). Replaces the bare `clients.conflict_checked_at` date. No new vendor |
| 9 | **Client status portal** (FR-41..45) | Separate principal and host (3.1, 3.9), passwordless auth, `lawai_portal` role and read views, Workflow with an approval hook, Resend sign-in links, WAF rate limit | `portal_users`, `portal_invitations`, `client_updates` (draft/approved/retracted, approver, time), `shared_documents`, views | RULE-4 enforced by database privileges, not just code (AC-25, AC-26, AC-27); no AI in the portal |
| 16 | **Client updates on WhatsApp** (FR-88..92) *proposed* | Same WhatsApp provider as Feature 11; Workflow with the Feature 9 approval hook; webhook route for delivery status, STOP and client replies; templates carry only approved fields; replies appear in a staff inbox and are never answered by a model | `client_channels` (consent, number, time, opted out), `client_inbox`; reuses `reminder_deliveries` | Proposed. One-way by design: the specification excludes client-facing AI chat. Same per-message cost as Feature 11; Meta template approval and consent wording are unvalidated (ASSUMPTION-3f41aff2). The provider is listed as a sub-processor in the ethical-wall receipt |
| 10 | **Courtroom-ready export** (FR-46..50) | `render` service, court CSS profiles, `python-docx`, Feature 1 labels, Noto fonts | `exports` (version hash, profile, user, time) | TOA from Verified citations only (FR-48); activity-logged (FR-50); depends on Feature 1 |
| 14 | **Court-fee and stamp-duty calculator** (FR-76..81) *proposed* | Fee rules added to the Jurisdiction Pack format; a pure function mirrored in `src/lib/` and the Python tools like `compute_deadline`; exposed as an agent tool so the assistant quotes it and never computes a fee itself; no model, no new vendor | `fee_rules` (kind, state or court, instrument or proceeding, slabs, cap, citation, effective from, provenance, reviewed by), pack version link | Proposed. The cost is data work and lawyer review per state, not infrastructure (ASSUMPTION-28217fff). Start with Delhi and Maharashtra. Result is a calculation to confirm with the registry; e-stamp purchase and fee payment are out of scope |
| 6 | **Firm-memory playbooks** (FR-26..30) | Weekly Cron + Workflow aggregating `document_issues` outcomes (counts and references, not model weights); `fast` tier only for rule wording; admin approval UI; versioned rules | `playbook_signals`, `playbook_rule_proposals`, `playbook_rule_versions` | Minimum evidence threshold (default 3, NFR-12), firm-scoped by RLS (FR-29, AC-17), proposals inert until approved (FR-28) |
| 7 | **Hindi/English documents** (FR-31..35) | OCR provider (3.5), Workflow per-batch steps, multilingual embeddings (3.4), per-language FTS, pdf.js correction UI, `chat` tier for labelled machine-translated summaries, Noto fonts | `ocr_pages` (confidence, text, bbox ref), `documents.language`, `embedding_model` | Do the **bake-off and schema columns in Phase 1** (cheap now, expensive later); ship the OCR product in the SPEC slot. Translation never marks a citation Verified (FR-34, AC-21) |

Cross-cutting (FR-51, FR-52, NFR-21, AC-31): human-approval records live in `activities` and the `access_log`; RLS test and gitleaks in CI.

---

## 5. Production-readiness checklist (ordered, phased)

Each item has an acceptance criterion (AC) that can be checked by someone other than the person who built it. Effort is rough engineer-days.

### Phase 0: must fix before any real customer data (about 2 to 3 weeks)

| # | Item | Acceptance criterion |
|---|---|---|
| 0.1 | **Separate production from development.** Create the `nonprod` Neon project; remove the production `DATABASE_URL` from `.env.local` and every machine; developers use `vercel env pull --environment=development` or Docker Postgres; rotate the production password and all production secrets that were ever on a laptop | A fresh clone with only documented files cannot connect to production; the old production password no longer works; `npm run dev` connects to local or nonprod only (verify by hostname log at boot) |
| 0.2 | **Destructive-script guard.** `reset-db`, `db:setup`, `db:push` and seed scripts refuse unless the database host is on an allow-list (localhost, nonprod) | Running `db:reset` with the production URL exits with an error and changes nothing (tested) |
| 0.3 | **Co-locate database and compute.** Recreate production Postgres in `aws-ap-southeast-1` (matches `sin1`); restore from dump | p95 query round trip from a function is under 20 ms; no cross-ocean DB hop; data verified by row counts |
| 0.4 | **Committed migrations.** Generate the baseline into `drizzle/`; switch scripts to `generate`/`migrate`; production migrates via a direct connection in the deploy job | `drizzle-kit` diff against production is empty; an empty database plus `npm run db:migrate` equals the production schema; no `push --force` remains in any script that can reach a shared database |
| 0.5 | **Email works.** Verify the sending domain (SPF, DKIM, DMARC); set `RESEND_API_KEY` and `EMAIL_FROM`; send invites and resets through `sendEmail`; keep the on-screen link fallback | Invite and reset mails reach Gmail and Outlook inboxes (not spam) within 60 seconds; links are single use and expire; a forced provider failure still shows the link |
| 0.6 | **Backups and restore drill.** Confirm PITR window; nightly logical dump to the Object-Lock bucket in a separate account | A documented restore into a new branch completes in under 30 minutes and passes a row-count check; the drill date is recorded |
| 0.7 | **Error tracking and structured logs.** Sentry in the app and the AI service with text scrubbing; request id propagated across services | A forced error in preview appears in Sentry with release and request id; a test document's text never appears in any event |
| 0.8 | **Auth hardening.** WAF rate limits on login, invite, upload, chat; per-account lockout; session idle timeout; revoke sessions on reset; CSP and HSTS; demo login off and demo users absent in production | The 11th failed login in 10 minutes gets 429; an idle session expires; a password reset signs out other devices; the production database has no `@demo.law` users |
| 0.9 | **LLM data handling.** Enable Groq zero data retention; sign the DPA; write the sub-processor list; per-firm daily AI cap enforced in `llm.py` | ZDR shown enabled in the console (screenshot kept); the cap refuses the call past the limit in a test; the list names every provider that sees content |
| 0.10 | **Domain and protection.** Production on a custom domain; Standard Protection stays on; a bypass secret stored only in CI | Preview URLs return the Vercel login page without credentials; production is public; the Playwright smoke test passes using the bypass header |
| 0.11 | **Minimum CI.** Typecheck, `pytest`, build, gitleaks on every PR; branch protection on `main` | A PR with a failing test or a planted fake key cannot merge |

### Phase 1: trust foundation (about 4 to 6 weeks; supports Features 1 to 3)

| # | Item | Acceptance criterion |
|---|---|---|
| 1.1 | **RLS on all tenant tables** with `withTenant`, DB roles, Python request transactions | Cross-firm CI test returns zero foreign rows on every endpoint and AI tool (AC-31); chunk search p95 with RLS within 20 percent of today's |
| 1.2 | **Preview branch per PR** plus staging environment and synthetic seed | Opening a PR creates a database branch and a working preview in under 5 minutes; closing deletes the branch |
| 1.3 | **Vercel Workflow ingestion** replacing `after()` and the blind retry | Killing a step mid-ingest resumes it; 100 uploaded files all reach `ready` or `failed` with a reason; upload latency is unchanged (NFR-5) |
| 1.4 | **`llm_calls` ledger, budget guard, gateway with fallback, prompt registry** | Disabling the primary provider in a test routes to the fallback within the timeout; every answer has a ledger row with prompt hash; cost per firm per day is queryable |
| 1.5 | **Append-only hash-chained `access_log`** and its writer role | Updating or deleting a row as the app role fails (AC-14); verification detects a tampered row; adds under 50 ms to retrieval (NFR-10) |
| 1.6 | **Embedding and OCR bake-offs; add `language` and `embedding_model` columns** | Report with recall@5 on 30 bilingual pairs and OCR error rates for each candidate; the winner is named and the owner approves the cost (D3, D4) |
| 1.7 | **TOTP MFA** (Better Auth spike, then rollout) | Admins and the platform operator cannot sign in without a second factor; backup-code recovery works; existing bcrypt users log in without a forced reset |
| 1.8 | **Eval harness v0** (citation verification, English retrieval, cross-matter probe) wired into CI | A deliberate retrieval regression fails the PR |
| 1.9 | **Feature 1 and Feature 2 foundations** (citation parser, pack loader, one deadline engine with shared vectors) | AC-1, AC-2, AC-4, AC-5, AC-6 pass in CI |
| 1.10 | **Reminder foundations** (Feature 11): hourly cron on Pro, notification model with firm and type, delivery log, per-channel opt-out; start WhatsApp template and SMS DLT registration | AC-32, AC-35 and AC-36 pass in CI with a fake provider; a duplicated cron tick sends once; the template and sender applications are filed |

### Phase 2: revenue and workflow features (about 6 to 8 weeks; Features 3 to 5, 9, 10)

| # | Item | Acceptance criterion |
|---|---|---|
| 2.1 | **Razorpay billing** (payment links first, then Subscriptions) with webhooks and GST invoices | A test firm pays, the plan and end date update from the webhook once even if it is delivered twice; a failed payment moves through grace to suspension |
| 2.2 | **`render` service**: certificate, brief, receipt, court export, with Devanagari fonts | AC-3, AC-10, AC-15, AC-28, AC-29 pass; a 100-page draft exports in under 30 seconds (NFR-19); Hindi quotes render without broken conjuncts |
| 2.3 | **Client portal**: separate principal, host, views and role | AC-25, AC-26, AC-27 pass; a portal cookie sent to the firm host is rejected and the reverse |
| 2.4 | **Scheduled briefs and time-capture drafts** via Cron + Workflow/Queue | AC-10, AC-22, AC-23, AC-24 pass; a duplicated cron tick produces one brief |
| 2.5 | **Client-upload path**: browser-to-Blob uploads and antivirus | A 150 MB upload succeeds; an EICAR test file is rejected |
| 2.6 | **First SSO connection** (Better Auth SSO plugin; WorkOS if more than about three) | A test IdP user signs in, gets the mapped role, and is bound to the right firm |
| 2.7 | **Status page, uptime checks, alert routing, on-call, incident runbook** | A simulated outage pages the on-call person and appears on the status page |
| 2.8 | **External penetration test** and fixes of high findings | No open high or critical finding |
| 2.9 | **Neon Scale for production** if any firm requires SOC 2 reports or IP allow-listing | Plan upgraded; allow-list active; 30-day restore window confirmed |

### Phase 3: scale, residency and Indian-language documents (after the first paying firms)

| # | Item | Acceptance criterion |
|---|---|---|
| 3.1 | **OCR and Hindi/English retrieval to production** (Feature 7), correction UI, per-firm OCR budget | AC-19, AC-20, AC-21 pass; a 100-page scan completes within the time budget (NFR-14) |
| 3.2 | **India-resident tier**: database in Mumbai, India-region LLM route, India-hosted OCR, self-hosted or India-resident embeddings | A test firm in this tier shows no content leaving India in network logs and in the receipt's provider list |
| 3.3 | **Firm-memory playbooks** (Feature 6) | AC-16, AC-17, AC-18 pass |
| 3.4 | **Self-hosted Langfuse (or equivalent) and prompt playground** for replay | Any past answer can be replayed from stored ids and prompt hash |
| 3.5 | **GDPR cell** design: EU region deployment, DSAR export and erasure tooling, SCC-based DPA | A test firm can be exported and deleted completely within the stated time |
| 3.6 | **SOC 2 Type 1 readiness** and customer-managed keys for enterprise | Policy set, evidence collection running, key rotation tested |
| 3.7 | **Read replica / reporting database; DR region plan** | Reports run off the replica; a documented failover rehearsal meets the stated RPO and RTO |
| 3.8 | **Hindi UI** if customers ask (WhatsApp reminders moved up to Features 11 and 16) | Only built against a signed customer request |

---

## 6. Risks, trade-offs and open decisions

### 6.1 Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Vercel Workflow and Queues are new (Queues labelled public beta in the installed skill; Workflow persistence is 7 days on Pro) | Pipeline limits or behaviour surprise us | The database is the system of record; `jobs/` interface; Phase 1 spike with Inngest as the pre-agreed Plan B |
| Singapore database is outside India | Sales objection; possible future restriction | Portable stack, tested migration runbook, owner decision D1 with a trigger |
| Hindi OCR and Devanagari full-text search quality unknown | Feature 7 slips | Bake-off, confidence flags, correction UI, vector-only fallback for Hindi lexical |
| Groq (US buckets, open-weight models) for client documents | Confidentiality objections; model quality for legal reasoning | ZDR + DPA, `reason` tier on a stronger model, `india` tier, eval gate decides the model |
| RLS adds query cost on the hot chunk table | Slower retrieval | Denormalised `firm_id, case_id` already present; benchmark in Phase 1 before enabling for chunks |
| Auth migration breaks sign-in | Lockout of customers | Feature-flagged cutover, bcrypt hash compatibility, rollback path, internal users first |
| LLM cost spikes (large imports, contextual notes) | Margin loss | Context notes redesigned (3.4), per-firm caps, gateway budgets, `llm_calls` dashboards |
| Single-vendor concentration on Vercel (compute, Blob, Workflow, Queues, Gateway) | Outage or pricing change hits everything | Services stay portable (FastAPI container, Postgres, S3 API); the Docker path in the repo stays working |
| Vendor claims taken at face value (OCR vendor benchmark, Sarvam price, Razorpay fees, third-party prices) | Wrong choice | Every such item is flagged in this document and is resolved by a measured test or a vendor confirmation before commitment |
| Over-engineering for a small team | Delay | Phases are ordered by customer risk; platform-native services over new vendors; deferred items are listed, not forgotten |
| Mixed legal accuracy of packs | Wrong deadlines | Provenance, lawyer review flag, human confirmation of every deadline (SPEC risks) |

### 6.2 Trade-offs taken knowingly

- **One Postgres for relational data, vectors, full-text and audit** over specialised stores. Simpler and safer for tenant filters; limits are reached only at much larger scale.
- **Gateway in front of providers** adds a hop and a dependency in exchange for fallbacks, budgets and logs; the break-glass direct route limits the downside.
- **No client text in observability vendors** costs us nice hosted trace UIs for now.
- **Staging is synthetic**, so some production-only bugs will be found later; the alternative (production copies) is worse for DPDP.
- **Better Auth over a hosted identity vendor** means we own auth correctness; mitigated by using a maintained library and an external penetration test.
- **Razorpay over Stripe** for availability and Indian payment methods, accepting a weaker story for foreign currency.

### 6.3 Open decisions for the owner

| # | Decision | My default | Needed by |
|---|---|---|---|
| D1 | **Where must production data live?** Singapore now (Neon), or Mumbai from day one (Supabase Postgres, then Vercel compute in `bom1`)? Mumbai also needs an India LLM/OCR path to be a true residency claim | Singapore until a customer contract or a notified rule requires India; move at that trigger using the tested runbook | Before Phase 0.3 |
| D2 | **LLM policy for client content:** accept Groq with ZDR and a DPA for the standard tier, with a frontier model for review/drafting, and offer the in-country tier only to firms that ask? Or require in-country inference for everyone? | Standard tier as described; in-country as an Enterprise add-on | Before first customer data |
| D3 | **OCR provider and per-firm page budget** after the bake-off | Sarvam primary, Google Document AI fallback, budget by plan | End of Phase 1 |
| D4 | **Embedding model** after the bake-off (cost per million tokens and recall@5) | `voyage-4` at 1024 dims if it meets the bar | End of Phase 1 |
| D5 | **Retention periods** for logs, deleted documents, portal content and backups (SPEC open question) | Access log 7 years (identifiers only), documents per firm contract, backups 35 days, portal content per matter closure plus 1 year | Before Phase 0.6 is signed off |
| D6 | **Billing model and first price points** (per seat or per firm; INR only at first?) and whether the plan limits include AI usage caps | Per seat per month in INR, with a fair-use AI cap per firm | Before Phase 2.1 |
| D7 | **Approve the move to Better Auth** and the MFA policy by role | Yes; mandatory for admin, platform operator, attorney | Before Phase 1.7 |
| D8 | **Who is on call, and the target SLO** (for example 99.5 percent monthly, business hours support) | Founders on call, 99.5 percent, status page public | Before first paid firm |

### 6.4 Assumptions that are not yet validated

These are recorded in Genesis as assumptions, not decisions: A1 Singapore acceptable until a trigger; A2 Groq open-weight models plus gateway fallbacks reach the needed quality at pilot cost; A3 Vercel Workflow and Queues carry ingestion reliably; A4 Sarvam Vision OCR quality on real Hindi legal scans; A5 `voyage-4` multilingual retrieval at 80 percent recall@5; A6 Better Auth can carry MFA, SSO and the portal with existing bcrypt hashes; A7 Razorpay Subscriptions fit and fees; A8 WeasyPrint in a container service renders Devanagari and exact TOA numbers; A9 RLS with pooled connections keeps retrieval latency acceptable; A10 the pilot cost estimate of about $450 a month; A11 to A16 (recorded 2026-10-19 for Features 11 to 16): WhatsApp/SMS approvals and cost, lawful eCourts data access, order-extraction accuracy, fee and stamp-duty data upkeep, the conflict-check exception to matter isolation, and WhatsApp consent and templates.

---

## 7. What I took from `pr-agent.html`, and what I did not

The document is a design study for an AI pull-request review agent (with a Tiger Cloud / TimescaleDB, Redis + ARQ, LangGraph, Railway implementation). I treated it as reference material only. Its reasoning transfers well to a legal assistant, because both systems must be grounded, selective, auditable and safe to run unattended; its product choices mostly do not.

### Adopted (the idea, in LawAI form)

| From the document | How it appears here |
|---|---|
| "Assign an LLM only where language is the output; deterministic things stay deterministic" (template, move 3) | RULE-1: Verified labels, deadlines, quote matches and access filters are code (3.3) |
| Grounding through retrieval, hybrid vector plus keyword with reciprocal rank fusion (L4, section 3.5) | Already in `search.py`; kept and extended to Hindi (3.4) |
| One Postgres store instead of one store per data shape (section 2.1 to 2.4) | Kept: relational + vector + FTS + audit in one database so filters run in one statement (3.6) |
| "Events spine": every action is one time-ordered row feeding trace, audit and cost (L6, section 3.6) | `llm_calls` ledger and the hash-chained `access_log`; plain partitioned Postgres tables (3.12, 3.13) |
| BudgetGuard that blocks before the next LLM call (ADR-004) | Per-firm daily AI cap in `llm.py`, plus gateway budgets (3.3) |
| Confidence-weighted human-in-the-loop gate and "start with more human involvement than you think" (L7, spectrum) | RULE-2 and FR-51: nothing leaves the firm or changes calendar, tasks, time or portal without approval; proposals are drafts (Features 3, 8, 9) |
| Ingress: verify signature, idempotency key, enqueue, return fast (section 3.1) | Webhook and upload pattern; idempotency keys on every ingress (3.2, 3.8) |
| Failure-mode catalog applied per component: timeouts, retries, circuit breaker, dead-letter, dedup (0.2, L8) | Reliability rules in 3.3 and 3.9 |
| Quote-style verification of model output against source before it is shown (grounding plus "cite evidence") | Verbatim substring checks for quotes and dates (Features 1 and 3) |
| Minimum-evidence threshold before learning from feedback, to avoid feedback-loop poisoning | Feature 6 default of 3 supporting examples (NFR-12) |
| Evaluation with golden datasets and a regression gate in CI (phase 9, 18) | Eval harness gating merges (3.15) |
| Hide the unsure decision behind a narrow interface; choose the cheap implementation now (3.3, LangGraph vs Temporal) | `jobs/` interface over Workflow; `llm.py` over the gateway; embedding model swappable by name |
| Modular monolith with inward-only dependencies (ADR-002) | Next.js monolith plus one Python service (3.2) |
| The 20-phase lens as a completeness check | Used as a checklist for gaps; the phased list in section 5 is shorter on purpose |
| Embedding dimension discipline (256-dim in that design) | We keep 1024 to avoid a migration, with the model recorded per row |

### Not adopted, with reasons

| From the document | Why not |
|---|---|
| Tiger Cloud, TimescaleDB hypertables, continuous aggregates, pgvectorscale / DiskANN | Our scale (thousands of chunks to low millions) fits plain pgvector HNSW; events are low-volume per firm; switching vendors would lose Neon branching and the Vercel integration, and add a vendor with no India region story. The principle (one store) is kept, the product is not |
| Redis + ARQ queue | An always-on Redis is infrastructure we would have to run; Vercel Workflow and Queues cover the need on the platform we already use |
| LangGraph (and Temporal as the later swap) | Our agent is a bounded tool loop (`agent.py`, max 8 steps), not a fan-out graph; durable multi-step work is handled by Workflow. Adding a graph framework is complexity without a benefit today |
| Four parallel specialist agents plus an aggregator | The legal tasks do not decompose the way a code review does; review is one playbook pass with verification. We keep the idea of separate passes where it earns its keep (extract, then compute, then verify) |
| Docker sandbox for tool execution | Our tools are read-only database queries and draft creation, not code execution; the isolation we need is tenant isolation (RLS), which the document does not cover |
| Railway deployment | We are already on Vercel; no benefit in moving |
| OpenAI as the only provider with `text-embedding-3-large` at 256 dimensions | Cross-language legal retrieval needs a measured multilingual model; 256 dimensions would hurt recall on Indic text |
| Hosted tracing as the audit trail (OpenTelemetry into the product DB) | We took the idea but not client text in vendor traces; our ledger stores identifiers and hashes |
| A "confidence" score on each finding as the primary control | Legal outputs need source links and deterministic labels more than model-reported confidence; we use confidence only for OCR quality flags and extraction ranking |
| Account sign-up steps, `.env` examples and credits for Tiger Cloud | Vendor onboarding material specific to its product |

The document is also a promotional case for one data vendor; its comparison table ("rejected because it splits memory from truth") argues for consolidation, which we accept, but it does not prove that a time-series extension is needed for ours.

---

## Appendix: sources (read 2026-10-19)

Platform and database
- Vercel pricing: https://vercel.com/pricing
- Vercel regions (Mumbai `bom1` exists): https://vercel.com/docs/regions
- Vercel Queues pricing and limits: https://vercel.com/docs/queues/pricing
- Vercel Workflow pricing and limits: https://vercel.com/docs/workflows/pricing
- Vercel Blob pricing: https://vercel.com/docs/vercel-blob/usage-and-pricing
- Vercel WAF rate limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Vercel Deployment Protection: https://vercel.com/docs/deployment-protection
- Vercel AI Gateway: https://vercel.com/docs/ai-gateway and https://vercel.com/docs/ai-gateway/security-and-compliance
- Neon plans and prices: https://neon.com/docs/introduction/plans
- Neon regions (no India region): https://neon.com/docs/introduction/regions
- Neon branching in GitHub Actions: https://neon.com/docs/guides/branching-github-actions
- Supabase regions (Mumbai `ap-south-1`): https://supabase.com/docs/guides/platform/regions
- Supabase pricing: https://supabase.com/pricing.md

LLM, embeddings, OCR
- Groq models and prices: https://console.groq.com/docs/models
- Groq data handling and ZDR: https://console.groq.com/docs/your-data
- Amazon Bedrock India in-country inference (OpenAI models): https://aws.amazon.com/blogs/machine-learning/introducing-openai-models-on-amazon-bedrock-for-in-country-inferencing-in-india/
- Voyage embedding models: https://docs.voyageai.com/docs/embeddings
- Sarvam pricing: https://docs.sarvam.ai/api-reference-docs/getting-started/pricing
- Sarvam Vision: https://docs.sarvam.ai/api/getting-started/models/sarvam-vision.md and https://www.sarvam.ai/blogs/sarvam-vision-2-1
- Sarvam Trust Center: https://www.sarvam.ai/trust-center
- Google Document AI pricing: https://cloud.google.com/document-ai/pricing

Auth, billing, email, observability
- Better Auth two-factor docs: https://www.better-auth.com/docs/plugins/2fa
- WorkOS pricing (third-party summary): https://ssojet.com/blog/workos-pricing-at-scale-50-100-200-connections
- Razorpay pricing: https://razorpay.com/pricing/
- Stripe India pricing: https://stripe.com/in/pricing
- Resend pricing (third-party summaries): https://automationatlas.io/answers/resend-pricing-explained-2026/
- Sentry pricing: https://sentry.io/pricing/
- Langfuse pricing: https://langfuse.com/pricing

Law, data and export
- DPDP Rules 2025 summaries: https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/ and https://www.mondaq.com/india/data-protection/1708164/digital-personal-data-protection-rules-2025-notified
- Indian High Court judgments, AWS Open Data (CC-BY-4.0): https://registry.opendata.aws/indian-high-court-judgments/
- WeasyPrint page-number references (guide): https://computingforgeeks.com/install-weasyprint-html-to-pdf/

Items I could not confirm from an authoritative page and flagged in the text: Voyage list prices and Hindi support, Resend dedicated-IP tiers, WorkOS prices, Better Auth SSO package details, Google Document AI Hindi and Mumbai processor availability, India Code reuse licence, Supabase Mumbai pricing parity and PITR price.
