# LawAI Documentation

LawAI is a matter-centric legal AI workspace for small and mid-size law firms, India first, whose answers and citations are verifiable. It combines matters, clients, documents, a calendar, tasks and time entries with AI features (document Q&A with citations, playbook-based contract review, drafting, legal research and deadline calculation). Access to everything, including every AI tool, follows matter staffing. This document is a set of rules and an explanation of the features: what exists today, what is planned, and the rules that bind both.

> Objective (draft, to be confirmed): LawAI is a matter-centric legal AI workspace for small and mid-size law firms, India first, whose answers and citations are verifiable.

Related files: [SPEC.md](../SPEC.md) (requirements, with stable FR/NFR/AC IDs), `docs/ARCHITECTURE.md`, `docs/features.html` and `docs/usp-ideas.html` (the sources of this document).

## Contents

1. [Roles](#roles)
2. [Project rules](#project-rules)
3. [Current features](#current-features)
4. [Known limitations](#known-limitations)
5. [Planned features](#planned-features)
6. [Competitive landscape](#competitive-landscape)
7. [Open questions](#open-questions)
8. [Contributing](#contributing)

## Roles

| Role | Description | Status |
|---|---|---|
| Platform operator | Runs the service across firms: onboards firms, manages plans, seats, suspension and renewals, and platform-level data. | Existing |
| Firm admin | Manages users, staffing, playbook rules, firm settings and sees every matter in the firm. | Existing |
| Attorney | Works on staffed matters; can open matters, set status, finalise or delete documents, see reports, and reviews and approves AI output. | Existing |
| Paralegal | Prepares documents, tasks and deadlines on staffed matters; limited to draft/in-review document statuses; cannot see firm reports. | Existing |
| End-client | Read-only portal user who sees only partner-approved updates for their own matters. | Planned (Feature 9) |

Matter access equals staffing (`case_members`), except that admins see every matter. This is enforced in `src/lib/access.ts` and `ai/lawai_ai/access.py`.

## Project rules

These rules bind every feature, current and planned. RULE-1 to RULE-5 are product invariants. RULE-8 and RULE-9 are further binding rules from [SPEC.md](../SPEC.md).

| ID | Rule |
|---|---|
| RULE-1 | The AI never presents an unverified citation as verified. A Verified label is set only by deterministic code that finds the authority and, for quotes, the exact text; never by the model. |
| RULE-2 | The AI drafts; a human approves anything that leaves the firm or changes a calendar, task, time entry or bill. |
| RULE-3 | Tenant isolation. No data crosses firms, and within a firm no data crosses matters the user is not staffed on. The filter is applied in the same query as retrieval. |
| RULE-4 | The client portal shows only partner-approved content for the client's own matters. |
| RULE-5 | Secrets are never stored in the repository. Configuration comes from environment variables; `.env` files stay git-ignored. |
| RULE-8 | Every AI-derived statement shown to a user links to its source or is omitted. Machine translations are labelled and never count as verification. |
| RULE-9 | Learned firm rules apply only after approval, and only within the firm that produced them. |

Process rules (commit messages, repository hygiene) are under [Contributing](#contributing).

## Current features

54 features were found in the code. Status values: **Working** (implemented end to end), **Partial** (works with known limits). No feature is currently demo-only. Roles abbreviations: Admin = firm admin, Atty = attorney, Para = paralegal, Op = platform operator.

### Auth and access (5)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Email and password login | Database-backed sessions (hashed token, httpOnly cookie). Suspended firms and deactivated users cannot sign in. | All roles | A lawyer signs in each morning; a firm that stopped paying is locked out. | `/login` | Working |
| Sign out | Sign-out button in the sidebar and in the header on small screens. | All roles | Log out of a shared office computer. | Sidebar / header | Working |
| Invite link and password setup | One-time invite link to set a first password; the same page handles password-reset links. Links are copied manually; no email is sent. | All roles | A new associate sets a password from the link the admin shares. | `/invite/[token]` | Working |
| Matter-level access control | Admins see every matter; attorneys and paralegals only matters they are staffed on. Applied to queries, pages, file downloads, search and every AI tool. | Admin, Atty, Para | A paralegal asking the assistant about a matter they are not on gets nothing back. | `src/lib/access.ts` | Working |
| Role permissions | Three firm roles. Admin and attorney open matters, set staffing and status, finalise or delete documents and see reports. Only admin manages the team, firm settings and playbook. | Admin, Atty, Para | Paralegals prepare drafts but cannot mark a contract final or see firm revenue. | `src/lib/permissions.ts` | Working |

### Dashboard and search (4)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Dashboard | Greeting, KPIs with period deltas, active matters ordered by next event, 14-day agenda, computed insights (open review findings, overdue tasks, failed uploads), recent documents and an Ask LawAI box. Operators are redirected to the platform console. | Admin, Atty, Para | Start the day seeing today's hearings and what needs attention. | `/` | Working |
| Global search | Searches cases, clients and the full text of documents from the header search box. | Admin, Atty, Para | Find every document mentioning a case number or party name. | `/search` | Working |
| Notifications bell | Latest 8 notifications with an unread count and mark-all-read. Which events create notifications was not traced. | Admin, Atty, Para | See that a review finished or a task was assigned. | Header | Working |
| Subscription banner | In-app banner when the firm's term ends within 14 days. | Admin | Reminder to renew before service lapses. | Header | Working |

### AI Assistant (5)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Streaming chat with citations | Streams answers (NDJSON) from an agent loop with tool use. Answers cite sources as [S1], [S2] chips that open the exact clause. Needs an LLM provider key; without it AI features show a configure notice. | Admin, Atty, Para | Ask what an MSA says about liability and click through to the clause. | `/assistant`, `POST /api/chat` | Working |
| Chat / Draft / Research modes | Mode switch: chat over the firm's data, draft clauses/letters/emails grounded in files, or research with jurisdiction citations. | Admin, Atty, Para | Move from a question to drafting a reply email in one place. | `/assistant` | Working |
| Scope to a matter or document | Open the assistant pre-scoped to one case or document (`?doc=`), limiting what it reads. | Admin, Atty, Para | "Ask about this document" from a contract page. | `/assistant?doc=...` | Working |
| Saved conversations and feedback | Conversations are stored and can be deleted; each answer can be rated thumbs up or down. | Admin, Atty, Para | Return to yesterday's research thread; flag a bad answer. | `/assistant` | Working |
| Agent tools (10) | `search_documents`, `get_schedule`, `list_tasks`, `find_cases`, `get_case`, `find_clients`, `get_client`, `get_document_issues`, `search_legal_sources`, `calculate_deadline`. Structured facts (dates, names) come from the database, not vector search. | Admin, Atty, Para | "When is my next hearing?" is answered exactly from the calendar table. | `ai/lawai_ai/agent/tools.py` | Working |

### AI engine, Python service (9)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Document ingestion pipeline | Parses PDF (page-aware) and DOCX/TXT/MD, structure-aware clause chunking, optional contextual notes per chunk, embeddings into pgvector, plus a full-text index. Scanned PDFs are not supported. | System | Uploaded contracts become searchable and citable minutes after upload. | `POST /ingest`, `ai/lawai_ai/rag/` | Working |
| Hybrid retrieval and rerank | Vector search plus Postgres full-text, fused with reciprocal rank fusion, clause-number boost and rerank. Falls back to full-text only when no embedding key is set. | System | Both "clause 9.2" and paraphrased questions work. | `POST /search`, `rag/search.py` | Working |
| Playbook review engine | The AI model flags clauses against the firm's playbook rules; quotes are verified verbatim; findings are stored as issues. | System | Catch an uncapped liability clause automatically. | `POST /review`, `review.py` | Working |
| Drafting engine | Generates text grounded in the matter's documents; usage is logged. | System | Draft a clause or letter from firm context. | `POST /draft`, `draft.py` | Working |
| Research engine | Searches the authorities library and answers citing only retrieved authorities, grouped by jurisdiction; stores the query. The library is a small seeded set, not verified legal data. | System | Compare how two jurisdictions treat a limitation period. | `POST /research`, `research.py` | Partial |
| Deadline rules engine | Computes due dates from a trigger date and per-jurisdiction rules; weekends roll forward. No court-holiday calendar yet. | System | Calculate the date to answer a complaint served today. | `agent/deadlines.py` | Partial |
| Index and ingest CLI | Commands to ingest pending/all documents and embed the legal-sources library. | System | Re-index after adding API keys. | `cli.py`, `npm run ingest:pending` | Working |
| Scheduled ingestion retry | Cron endpoint protected by `CRON_SECRET` retries stuck or failed ingestion. Runs in-process with a cron retry; no job queue. | System | A document that failed to index is picked up automatically. | `GET /api/cron/ingest` | Working |
| Internal AI service API | Token-protected FastAPI endpoints (health, status, chat, search, research, review, draft, ingest). Never called from the browser; user matters are re-derived from the database. | System | Keeps the AI service private. | `ai/lawai_ai/api.py`, `/api/internal/files` | Working |

### Matters (5)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Case list | Filterable, paginated list of matters you can access. | Admin, Atty, Para | Find all open matters for a practice area. | `/cases` | Working |
| Create case | Open a new matter and staff the team (creator becomes lead). | Admin, Atty | Intake of a new litigation matter. | `/cases/new` | Working |
| Case detail | Overview, upcoming events, open tasks, documents, status, team, time logging and activity log. | Admin, Atty, Para | One screen with everything before a hearing. | `/cases/[id]` | Working |
| Edit case and staffing | Update stage, priority, court; attorneys/admins can change status (hold/close), team and lead. Paralegals can edit stage, priority and court only. | Admin, Atty, Para | Reassign a matter when an associate leaves. | `/cases/[id]` | Working |
| Time logging | Log billable hours against a matter. Hours feed reports; no invoicing exists. | Admin, Atty, Para | Record 1.5h of drafting for billing and utilisation. | `/cases/[id]` | Working |

### Clients (2)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Client list and create | List clients and add new ones. | Admin, Atty, Para | Add a new client at intake. | `/clients`, `/clients/new` | Working |
| Client detail | Contact details, accessible matters, logged activity timeline; edit and log activity (calls, notes). Clients are records only; there is no client portal yet. | Admin, Atty, Para | Note a call with a client for the file. | `/clients/[id]` | Working |

### Tasks and calendar (4)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Task list and calendar | Month calendar plus grouped open-task list; complete or reopen tasks. | Admin, Atty, Para | See this week's filings and hearings. | `/tasks` | Working |
| Add task / event | Create tasks (assignee, priority, due date) and calendar events linked to matters; delete events. | Admin, Atty, Para | Schedule a hearing and assign prep tasks. | `/tasks` | Working |
| Court-deadline calculator | Calculates a deadline from a trigger date using database rules with weekend roll-forward (same engine as the AI tool). No court holidays. | Admin, Atty, Para | Work out the response deadline after service. | `/tasks` | Partial |
| Urgent badge | Sidebar badge counts open high-priority or due-within-3-days tasks. | Admin, Atty, Para | At-a-glance workload. | Sidebar | Working |

### Documents (6)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Library and upload | List and upload PDF/DOCX/TXT/MD files; ingestion runs automatically. | Admin, Atty, Para | Upload a signed contract to a matter. | `/documents`, `POST /api/documents/upload` | Working |
| Document viewer | Text view with status, kind, version and size; ask-about-this-document, download, retry failed ingestion. | Admin, Atty, Para | Read a contract and jump to a cited clause. | `/documents/[id]`, `GET /api/documents/[id]/file` | Working |
| Playbook AI review | Run review against the firm's playbook; issues flagged per clause; accept (creates a new version and re-indexes) or dismiss. | Admin, Atty, Para | Redline a vendor contract before the partner sees it. | `/documents/[id]`, `POST /api/documents/[id]/review` | Working |
| Versions and editing | Edit text, save new versions, restore an earlier version, append AI-drafted text. | Admin, Atty, Para | Roll back after a bad edit. | `/documents/[id]` | Working |
| Document status | Draft, in review, final, signed, filed. Paralegals limited to draft/in review. | Admin, Atty, Para | Mark a contract signed. | `/documents/[id]` | Working |
| Delete document | Remove a document. | Admin, Atty | Remove a wrongly uploaded file. | `/documents/[id]` | Working |

### Drafting, research and reports (3)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Drafting and review hub | Lists documents in draft or review and creates new AI-drafted documents. | Admin, Atty, Para | Draft an NDA from a short prompt and save it to a matter. | `/drafting`, `POST /api/draft` | Working |
| Legal research | Hybrid search over a legal-sources library filtered by jurisdiction, with a cited AI summary and recent research history. Seeded sample library only. | Admin, Atty, Para | Quick check of authorities on a point of law. | `/research`, `POST /api/research` | Partial |
| Reports | Quarter / last quarter / YTD: billable hours per week, open matters by practice area, utilisation vs weekly target, LawAI usage and hours saved. Hours saved uses admin-set assumptions, not measured time. | Admin, Atty | A partner reviews utilisation and ROI of the AI. | `/reports` | Working |

### Settings and firm admin (4)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Profile | Edit name, title, weekly billable target and password. | Admin, Atty, Para | Change your password. | `/settings` | Working |
| Team management | Invite members, resend invite, reset password, change role, deactivate/reactivate. Seat limit is set by the platform operator. | Admin | Onboard a paralegal; revoke access when they leave. | `/settings` | Working |
| Firm settings | Firm name, practice jurisdictions, AI minutes-saved assumptions. | Admin | Set jurisdictions so research is filtered correctly. | `/settings` | Working |
| Playbook rules | Add or delete review rules (title, document type, severity, rule text). Other roles see rules read-only. | Admin | Encode "payment terms must be 30 days or less". | `/settings` | Working |

### Platform operator (7)

| Feature | What it is | Who | Use case | Where | Status |
|---|---|---|---|---|---|
| Platform overview | Customer firms, seats, revenue, renewals and top AI usage. | Op | See revenue and who is up for renewal. | `/platform` | Working |
| Firms list and CSV export | All firms with plan, renewal date, seats, team, usage; filter and export as CSV. | Op | Export for invoicing. | `/platform/firms`, `/platform/firms/export` | Working |
| Onboard a firm | Create a firm and invite its first admin via a link. | Op | Sign up a new customer. | `/platform/firms/new`, `POST /api/platform/firms` | Working |
| Firm detail and subscription | Seats, team counts, cases, documents, 30-day AI actions and tokens; edit plan (trial/starter/professional/enterprise), seat limit, monthly fee, end date; renew by months. Billing is manual; no payment processor. | Op | Upgrade a trial to a paid plan. | `/platform/firms/[id]` | Working |
| Suspend / restore firm | Stop service with a private reason, or restore. Suspended firms cannot sign in. | Op | Stop service for an unpaid invoice. | `/platform/firms/[id]`, `/api/platform/firms/[id]/suspend`, `/restore` | Working |
| Firm admin invites | Invite additional admins or issue a new invite link. | Op | A customer's admin lost their link. | `/platform/firms/[id]`, `/api/platform/firms/[id]/admins` | Working |
| Renewals | Firms grouped by when the trial or term ends; nothing switches off automatically. | Op | Chase renewals. | `/platform/renewals` | Working |

## Known limitations

- No client login or portal; clients exist only as records.
- Scanned PDFs are not supported (no OCR); ingestion rejects PDFs without a text layer.
- The legal-sources library is a small seeded set and is not verified legal data. Real sources need to be licensed.
- The deadline engine has no court-holiday calendar; only weekends roll forward.
- Invite and reset links are copied manually; no email delivery was found in the code.
- Billing is manual; there is no payment processor, and no invoicing (logged hours feed reports only).
- "Hours saved" in reports uses admin-set assumptions, not measured time.
- Ingestion retries run in-process with a cron endpoint; there is no job queue.
- Which events create notifications was not traced.
- AI features need an LLM provider key; retrieval falls back to full-text only without an embedding key.

## Planned features

Ten features make LawAI trustworthy and India-ready. All are **Planned**; none is built. Requirement IDs (FR, NFR, AC) and non-goals for each are in [SPEC.md](../SPEC.md). Sequencing is decided in the plan phase. Features 1 to 3 are the top picks.

| # | Feature | What | Who | Why it differentiates | Requirements | Status |
|---|---|---|---|---|---|---|
| 1 | Cite-Proof ledger (top pick) | Every claim and citation in an AI answer, draft or review gets a Verified or Unverified label set by deterministic code, with an exportable verification certificate (PDF) that goes stale if the document changes. | Attorneys, paralegals; admins set certificate policy | Others market "grounded" answers but show no per-claim result; one study found 17-33% hallucination even in leading tools. Quote checking already exists in `review.py`. | FR-1 to FR-5 | Planned |
| 2 | India Pack (top pick) | Indian limitation and CPC/CrPC deadline rules, a bare-acts statute library, an IPC to BNS (also CrPC to BNSS, Evidence Act to BSA) mapping, and court holidays in the deadline calculator. Every record carries provenance and lawyer review. | Attorneys, paralegals in Indian firms | Global leaders are US/UK-first; Indian rivals focus on research or contract management, not matter workflow. A defensible local moat. | FR-6 to FR-10 | Planned |
| 3 | Service-to-calendar autopilot (top pick) | On upload of a notice, summons or order, extract dates with source quotes, compute deadlines and propose tasks and events for the staffed team. Nothing is written until a human confirms. | Paralegals, attorneys | Joins document ingestion to the deadline engine and staffing, which only a matter-centric product can do. | FR-11 to FR-15 | Planned |
| 4 | Hearing-day brief | A one-page, source-linked brief per upcoming hearing: summary, last order, open tasks, deadlines, key documents and cited authorities. | Attorney appearing, paralegals | Competitors answer questions; few push a ready brief proactively. | FR-16 to FR-20 | Planned |
| 5 | Ethical-wall receipts | Per-matter report of what the AI could and did access, built from an append-only, hash-chained log, with proof that staff outside the matter were excluded and the model providers that processed content. | Firm admins, data protection contact | Access control is rarely demonstrable per answer; supports DPDP Act 2023 questions from clients. | FR-21 to FR-25 | Planned |
| 6 | Firm-memory playbooks | Learns from accepted and dismissed review issues and proposes playbook rules; an admin or partner approves each rule before it applies. No model retraining. | Attorneys (feedback), partners and admins (approval) | Competitors ship generic playbooks; few learn from the firm's own edits. | FR-26 to FR-30 | Planned |
| 7 | Hindi/English documents | OCR for scanned pages, cross-language retrieval, and summaries labelled as machine translations. Citations always refer to original-language text. | Everyone handling Indian court papers | Western tools handle Indian languages weakly; Indian tools rarely combine them with firm-private retrieval. Removes the current scanned-PDF limitation. | FR-31 to FR-35 | Planned |
| 8 | AI time capture | Drafts billable time entries from the day's activity, with evidence, for the lawyer to edit and approve. | Attorneys, paralegals; admins for billing | Billing vendors capture time but not from AI conversations and documents tied to matters. | FR-36 to FR-40 | Planned |
| 9 | Client status portal | Read-only portal with partner-approved, plain-language updates, the next hearing date and shared documents. Introduces the end-client role. | End-clients (read); attorneys, partners (approve) | Enterprise tools are lawyer-only; approved updates reduce status calls without exposing the workspace. | FR-41 to FR-45 | Planned |
| 10 | Courtroom-ready export | Export a draft to DOCX/PDF in court format with an index and a Table of Authorities built only from Verified citations. | Attorneys finalising filings | Few tools output paginated, cite-checked drafts. Depends on Feature 1. | FR-46 to FR-50 | Planned |

Cross-cutting requirements (FR-51, FR-52, NFR-21, AC-31) enforce human approval, firm and matter filtering, and no committed secrets across all ten features. Global non-goals: no legal advice, outcome prediction or court filing; no certification that cited authority is good law; no client-facing AI chat, billing or payments; no model fine-tuning on client data; jurisdictions other than India and languages other than Hindi and English are out of scope for this release.

## Competitive landscape

Scan as of October 2026. **Pricing figures are third-party estimates** from competitor blogs and comparison sites; vendors do not publish list prices, several sources are vendor-adjacent, and Indian product launch status was not confirmed against official releases.

| Competitor | What it does | Gaps / complaints | Source |
|---|---|---|---|
| Harvey | Enterprise AI for large firms: research, drafting, diligence, workflows. | Estimated $1,000-2,000+/seat/month, 20-25+ seat minimums, extra implementation cost; effectively enterprise-only. | [Bind Legal](https://bindlegal.com/resources/comparisons/harvey-pricing-2026/) |
| Legora | Collaborative workspace, Tabular Review, multi-jurisdiction research (12 jurisdictions). | Estimated ~$3k/user/year, 10-seat floor; both it and Harvey still need human cite-checks. Figures unverified. | [Spellbook](https://www.spellbook.com/briefs/legora-vs-harvey) |
| CoCounsel / Westlaw AI (Thomson Reuters) | Research and drafting on Westlaw and Practical Law content. | Stanford study: Westlaw AI research tool hallucinated on about 1 in 3 queries; Practical Law AI declined or gave ungrounded answers on 60%+. CoCounsel itself not tested. | [Fortune](https://dc.fortune.com/2024/06/04/stanford-hai-legal-ai-copilot-study-rag-llms-future-of-ai) |
| Lexis+ AI (LexisNexis) | Cited research answers on Lexis content. | About 17% hallucination in the same study (best of the group, not zero). | [Fortune](https://dc.fortune.com/2024/06/04/stanford-hai-legal-ai-copilot-study-rag-llms-future-of-ai) |
| Spellbook | Contract drafting and review inside Word. | Reviewers cite hallucinations needing verification; weaker fit beyond Word-based negotiation; pricing by quote. | [Spellbook](https://spellbook.com/learn/luminance-pricing) |
| Luminance | Enterprise contract review, strong in M&A diligence. | Quote-only pricing (estimated ~$43k average deal, unconfirmed); learning curve. | [eesel](https://www.eesel.ai/blog/luminance-ai-review) |
| SpotDraft (India/US) | Contract lifecycle management for in-house teams: AI redlining, e-sign, repository. | In-house focus, not law-firm matter work; no hearings, deadlines or client files. | [Gartner](https://www.gartner.com/reviews/product/spotdraft) |
| Jurisphere (India) | AI drafting, review, research and due diligence for Indian firms. | Young ($2.2M seed); firm-level deals, no self-serve small-firm story seen. | [Global Legal Post](https://www.globallegalpost.com/news/indian-legal-ai-platform-start-up-jurisphere-raises-22m-in-funding-round-1120556859) |
| CaseMine AMICUS (India) | Generative assistant over Indian case law. | Research-centric, not practice management; its 88% accuracy claim is self-reported. | [Bar and Bench](https://www.barandbench.com/news/casemine-launches-ai-powered-legal-assistant-amicus) |
| SCC Online AI Pro / Manupatra (India) | Incumbent Indian databases adding AI layers. | Database-first; launch status and depth not independently confirmed; subscription lock-in to their content. | [SCC Online](https://www.scconline.com/blog/post/2026/01/26/scc-online-ai-pro-republic-day-announcement/) |

Incident context: [Supreme Court on fake AI citations (Bar and Bench)](https://www.barandbench.com/news/litigation/supreme-court-declares-zero-tolerance-to-citing-fake-ai-generated-judgments-asks-bci-to-frame-norms).

Summary: the market is split between US/UK enterprise tools priced out of reach for small firms, Indian research or contract-management products that are not matter workflow, and tools whose citations still need rechecking. LawAI targets the gap with matter-level access control, verifiable citations and India-specific procedure.

## Open questions

- Is the objective statement correct as drafted?
- Which source supplies Indian statutes, limitation rules and court holidays, and under what licence?
- Which OCR engine and which multilingual embedding model for Hindi legal text?
- Who is the "partner" approver: the admin role, or a new role?
- Release priority and order of the ten features.
- Which courts' formatting profiles come first for the courtroom export?
- Data retention periods for logs and portal content.

## Contributing

- Every git commit message is exactly `lawAI MVP`, with no body and no AI attribution.
- Next.js in this project has breaking changes; follow the guides in `node_modules/next/dist/docs/` (see `AGENTS.md`).
- Never commit secrets (RULE-5).
